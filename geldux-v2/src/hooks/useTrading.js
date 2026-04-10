import { useState, useCallback } from 'react'
import { Contract, parseUnits, Signature } from 'ethers'
import { ADDRESSES, ABI_USDC, ABI_PYTH, ABI_PERP_CORE, ABI_ORDER_MANAGER, ABI_CROSS_MARGIN, ABI_FAUCET } from '@/config/contracts'
import { CHAIN_ID, PERMIT_DEADLINE_SECONDS } from '@/config/chain'
import { MARKETS } from '@/config/markets'
import { getSigner, getAccount } from './useWallet'
import { fetchVaas } from './usePrices'

/* ── Permit helper ───────────────────────────────────────────────────── */
async function signPermit(signer, spender, amount) {
  const usdc = new Contract(ADDRESSES.USDC, ABI_USDC, signer)
  const [name, nonce] = await Promise.all([
    usdc.name().catch(() => 'USD Coin'),
    usdc.nonces(getAccount()),
  ])
  const deadline = Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS
  const domain   = { name, version: '2', chainId: CHAIN_ID, verifyingContract: ADDRESSES.USDC }
  const types    = {
    Permit: [
      { name: 'owner',    type: 'address' },
      { name: 'spender',  type: 'address' },
      { name: 'value',    type: 'uint256' },
      { name: 'nonce',    type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  }
  const value = { owner: getAccount(), spender, value: amount, nonce, deadline }
  const sig   = await signer.signTypedData(domain, types, value)
  const { v, r, s } = Signature.from(sig)
  return { v, r, s, deadline }
}

/* ── Pyth VAA + fee ──────────────────────────────────────────────────── */
async function getPythData(signer) {
  const pythIds    = MARKETS.map((m) => m.pythId)
  const updateData = await fetchVaas(pythIds)
  const pyth       = new Contract(ADDRESSES.PYTH, ABI_PYTH, signer)
  const fee        = await pyth.getUpdateFee(updateData)
  return { updateData, fee }
}

/* ── Wait for receipt ────────────────────────────────────────────────── */
async function waitTx(tx) {
  const receipt = await tx.wait(1)
  if (receipt?.status === 0) throw new Error('Transaction reverted on-chain.')
  return receipt
}

export function useTrading({ onSuccess, onError } = {}) {
  const [pending, setPending] = useState(false)
  const [step,    setStep]    = useState('')

  const run = useCallback(async (label, fn) => {
    setPending(true)
    setStep(label)
    try {
      const result = await fn()
      onSuccess?.(result)
      return result
    } catch (e) {
      const msg = e?.reason || e?.message || 'Transaction failed'
      onError?.(msg)
      throw e
    } finally {
      setPending(false)
      setStep('')
    }
  }, [onSuccess, onError])

  /* ── Open isolated position (1 signature) ────────────────────────── */
  const openPosition = useCallback(async ({ sym, isLong, leverage, collateralUsd }) => {
    return run(`Opening ${isLong ? 'Long' : 'Short'} ${sym}…`, async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const market       = MARKETS.find((m) => m.sym === sym)
      if (!market) throw new Error('Unknown market')
      const collateralRaw = parseUnits(String(Number(collateralUsd).toFixed(18)), 18)

      setStep('Signing permit…')
      const { v, r, s, deadline } = await signPermit(signer, ADDRESSES.PERP_CORE, collateralRaw)

      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer)

      setStep(`Submitting ${isLong ? 'Long' : 'Short'}…`)
      const core = new Contract(ADDRESSES.PERP_CORE, ABI_PERP_CORE, signer)
      const tx   = await core.openWithPermitAndPriceUpdate(
        market.key, isLong, leverage, collateralRaw, false,
        deadline, v, r, s, updateData,
        { value: fee }
      )
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Increase isolated position (1 signature) ───────────────────── */
  const increasePosition = useCallback(async ({ posId, sym, collateralUsd }) => {
    return run('Increasing position…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const collateralRaw = parseUnits(String(Number(collateralUsd).toFixed(18)), 18)

      setStep('Signing permit…')
      const { v, r, s, deadline } = await signPermit(signer, ADDRESSES.PERP_CORE, collateralRaw)

      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer)

      setStep('Submitting increase…')
      const core = new Contract(ADDRESSES.PERP_CORE, ABI_PERP_CORE, signer)
      /* No leverage param — contract reads it from existing position */
      const tx   = await core.increaseWithPermitAndPriceUpdate(
        posId, collateralRaw, deadline, v, r, s, updateData, { value: fee }
      )
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Close isolated position ─────────────────────────────────────── */
  const closePosition = useCallback(async ({ posId, sym }) => {
    return run('Closing position…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')

      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer)

      setStep('Submitting close…')
      const core = new Contract(ADDRESSES.PERP_CORE, ABI_PERP_CORE, signer)
      const tx   = await core.closeWithPriceUpdate(posId, updateData, { value: fee })
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Create limit order ──────────────────────────────────────────── */
  const createLimitOrder = useCallback(async ({ sym, isLong, leverage, collateralUsd, triggerPrice }) => {
    return run('Creating limit order…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const market = MARKETS.find((m) => m.sym === sym)
      const cRaw   = parseUnits(String(Number(collateralUsd).toFixed(18)), 18)
      const tRaw   = parseUnits(String(Number(triggerPrice).toFixed(18)), 18)
      const mgr    = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, signer)

      /* Need prior USDC approval for limit orders */
      const usdc = new Contract(ADDRESSES.USDC, ABI_USDC, signer)
      const have = await usdc.allowance(getAccount(), ADDRESSES.ORDER_MANAGER)
      if (have < cRaw) {
        setStep('Approving USDC…')
        const appTx = await usdc.approve(
          ADDRESSES.ORDER_MANAGER,
          BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
        )
        await waitTx(appTx)
      }

      setStep('Fetching execution fee…')
      const minFee = await mgr.minExecFee()

      setStep('Creating order…')
      const tx = await mgr.createLimitOrder(
        market.key, isLong, leverage, cRaw, false, tRaw, { value: minFee }
      )
      setStep('Confirming…')
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Stop loss ───────────────────────────────────────────────────── */
  const createStopLoss = useCallback(async ({ posId, triggerPrice, fractionBps = 10000 }) => {
    return run('Setting stop-loss…', async () => {
      const signer  = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const tRaw    = parseUnits(String(Number(triggerPrice).toFixed(18)), 18)
      const mgr     = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, signer)
      const minFee  = await mgr.minExecFee()
      const tx      = await mgr.createStopLoss(posId, tRaw, fractionBps, { value: minFee })
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Take profit ─────────────────────────────────────────────────── */
  const createTakeProfit = useCallback(async ({ posId, triggerPrice, fractionBps = 10000 }) => {
    return run('Setting take-profit…', async () => {
      const signer  = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const tRaw    = parseUnits(String(Number(triggerPrice).toFixed(18)), 18)
      const mgr     = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, signer)
      const minFee  = await mgr.minExecFee()
      const tx      = await mgr.createTakeProfit(posId, tRaw, fractionBps, { value: minFee })
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Cancel order ────────────────────────────────────────────────── */
  const cancelOrder = useCallback(async ({ orderId }) => {
    return run('Cancelling order…', async () => {
      const signer  = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const mgr     = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, signer)
      const tx      = await mgr.cancelOrder(orderId)
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Cross margin deposit (1 sig) ────────────────────────────────── */
  const crossDeposit = useCallback(async ({ amountUsd }) => {
    return run('Depositing to cross margin…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const amtRaw = parseUnits(String(Number(amountUsd).toFixed(18)), 18)
      setStep('Signing permit…')
      const { v, r, s, deadline } = await signPermit(signer, ADDRESSES.CROSS_MARGIN, amtRaw)
      setStep('Depositing…')
      const cross   = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, signer)
      const tx      = await cross.depositWithPermit(amtRaw, deadline, v, r, s)
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Cross margin withdraw ───────────────────────────────────────── */
  const crossWithdraw = useCallback(async ({ amountUsd }) => {
    return run('Withdrawing from cross margin…', async () => {
      const signer  = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const amtRaw  = parseUnits(String(Number(amountUsd).toFixed(18)), 18)
      const cross   = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, signer)
      const tx      = await cross.withdraw(amtRaw)
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Partial close isolated position ────────────────────────────── */
  const partialClosePosition = useCallback(async ({ posId, collateralDelta }) => {
    return run('Partially closing position…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')

      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer)

      setStep('Submitting partial close…')
      const core = new Contract(ADDRESSES.PERP_CORE, ABI_PERP_CORE, signer)
      const deltaRaw = parseUnits(String(Number(collateralDelta).toFixed(18)), 18)
      const tx   = await core.partialCloseWithPriceUpdate(posId, deltaRaw, updateData, { value: fee })
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Cross margin increase position ────────────────────────────── */
  /* Draws extra collateral from the trader's existing cross-margin   */
  /* account balance — no permit needed.                              */
  const crossIncreasePosition = useCallback(async ({ posId, collateralUsd }) => {
    return run('Increasing cross position…', async () => {
      const signer  = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const extraRaw = parseUnits(String(Number(collateralUsd).toFixed(18)), 18)
      const cross    = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, signer)
      const tx       = await cross.increasePosition(posId, extraRaw)
      const receipt  = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Cross margin open position ──────────────────────────────────── */
  const crossOpenPosition = useCallback(async ({ sym, isLong, leverage, collateralUsd }) => {
    return run(`Opening cross ${isLong ? 'Long' : 'Short'} ${sym}…`, async () => {
      const signer  = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const market  = MARKETS.find((m) => m.sym === sym)
      if (!market) throw new Error('Unknown market')
      const cRaw    = parseUnits(String(Number(collateralUsd).toFixed(18)), 18)
      const cross   = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, signer)
      const tx      = await cross.openPosition(market.key, isLong, leverage, cRaw, false)
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Cross margin close position ─────────────────────────────────── */
  const crossClosePosition = useCallback(async ({ posId, fractionBps = 10000 }) => {
    return run('Closing cross position…', async () => {
      const signer  = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const cross   = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, signer)
      const tx      = await cross.closePosition(posId, fractionBps)
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Faucet claim ────────────────────────────────────────────────── */
  const claimFaucet = useCallback(async () => {
    return run('Claiming testnet tokens…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const fau = new Contract(ADDRESSES.FAUCET, ABI_FAUCET, signer)
      const can = await fau.canClaim(getAccount())
      if (!can) {
        const rem = await fau.cooldownRemaining(getAccount())
        const h   = Math.floor(Number(rem) / 3600)
        const m   = Math.ceil((Number(rem) % 3600) / 60)
        throw new Error(`Faucet on cooldown: ${h}h ${m}m remaining.`)
      }
      const tx      = await fau.claim({ gasLimit: 120000 })
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  return {
    pending, step,
    openPosition, increasePosition, closePosition, partialClosePosition,
    createLimitOrder, createStopLoss, createTakeProfit, cancelOrder,
    crossDeposit, crossWithdraw, crossOpenPosition, crossClosePosition, crossIncreasePosition,
    claimFaucet,
  }
}
