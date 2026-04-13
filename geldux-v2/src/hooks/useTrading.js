import { useState, useCallback } from 'react'
import { Contract, parseUnits, Signature, TypedDataEncoder } from 'ethers'
import { ADDRESSES, ABI_USDC, ABI_PYTH, ABI_PERP_CORE, ABI_ORDER_MANAGER, ABI_CROSS_MARGIN, ABI_FAUCET } from '@/config/contracts'
import { CHAIN_ID, PERMIT_DEADLINE_SECONDS } from '@/config/chain'
import { MARKETS } from '@/config/markets'
import { getSigner, getAccount, getReadProvider } from './useWallet'
import { fetchVaas } from './usePrices'

/* Development-only guard — logs a clear error if a critical invariant is violated */
function devAssert(condition, msg) {
  if (!condition) console.error('[useTrading] INVARIANT VIOLATION:', msg)
}

/* ── Permit helper ───────────────────────────────────────────────────── */
async function signPermit(signer, spender, amount) {
  const owner = await signer.getAddress()

  /* Use the signer's own underlying provider for USDC view calls.
     One-off eth_calls via BrowserProvider are reliable and always available
     when the signer is connected. Rate limiting only occurs from recurring
     eth_blockNumber polling, not from individual eth_call reads.
     Fall back to the dedicated read provider if the signer has no provider. */
  const usdcProv = signer.provider ?? getReadProvider()
  devAssert(!!usdcProv, 'signPermit: no provider available for USDC reads')
  const usdcRead = new Contract(ADDRESSES.USDC, ABI_USDC, usdcProv)

  /* Fetch name and on-chain DOMAIN_SEPARATOR in parallel */
  const [name, onChainSep] = await Promise.all([
    usdcRead.name().catch(() => 'USD Coin'),
    usdcRead.DOMAIN_SEPARATOR().catch(() => null),
  ])

  /* Fetch nonce via read provider; fall back to signer provider, then 0n */
  let nonce = 0n
  try {
    nonce = await usdcRead.nonces(owner)
  } catch (_) {
    try {
      const usdcSigner = new Contract(ADDRESSES.USDC, ABI_USDC, signer)
      nonce = await usdcSigner.nonces(owner)
    } catch (__) {
      console.warn('[signPermit] nonces() failed both providers, using 0n')
    }
  }

  /* Auto-detect domain by hashing each candidate and comparing to on-chain value.
     Candidates in priority order:
       1. name + version='1' + chainId + verifyingContract  (most custom tokens)
       2. name + version='2' + chainId + verifyingContract  (Circle USDC)
       3. name + chainId + verifyingContract                (no-version variant)
  */
  const candidates = [
    { name, version: '1', chainId: CHAIN_ID, verifyingContract: ADDRESSES.USDC },
    { name, version: '2', chainId: CHAIN_ID, verifyingContract: ADDRESSES.USDC },
    { name,               chainId: CHAIN_ID, verifyingContract: ADDRESSES.USDC },
  ]
  let domain = candidates[0]
  if (onChainSep) {
    console.log('[signPermit] on-chain DOMAIN_SEPARATOR:', onChainSep)
    for (const c of candidates) {
      try {
        const computed = TypedDataEncoder.hashDomain(c)
        console.log('[signPermit] candidate', JSON.stringify({ ...c, chainId: Number(c.chainId) }), '→', computed)
        if (computed.toLowerCase() === onChainSep.toLowerCase()) {
          domain = c
          console.log('[signPermit] DOMAIN MATCHED ✓', JSON.stringify({ ...domain, chainId: Number(domain.chainId) }))
          break
        }
      } catch (_) {}
    }
    if (domain === candidates[0]) {
      console.warn('[signPermit] ⚠ no candidate matched on-chain separator — using version=1 as default')
    }
  }

  const deadline = Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS
  const types    = {
    Permit: [
      { name: 'owner',    type: 'address' },
      { name: 'spender',  type: 'address' },
      { name: 'value',    type: 'uint256' },
      { name: 'nonce',    type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  }
  const message = { owner, spender, value: amount, nonce, deadline }

  console.log('[signPermit] ── SIGNING ──')
  console.log('  domain :', JSON.stringify({ ...domain, chainId: Number(domain.chainId) }))
  console.log('  owner  :', owner)
  console.log('  spender:', spender)
  console.log('  amount :', amount.toString(), '(', Number(amount) / 1e18, 'USDC )')
  console.log('  nonce  :', nonce.toString())
  console.log('  deadline:', deadline)

  const sig   = await signer.signTypedData(domain, types, message)
  const { v, r, s } = Signature.from(sig)
  console.log('[signPermit] v:', v, '| r:', r.slice(0, 18) + '… | s:', s.slice(0, 18) + '…')
  return { v, r, s, deadline }
}

/* ── Retry sendTransaction for RPC rate limiting ─────────────────────── */
async function sendWithRetry(contractFn, maxRetries = 4) {
  let delay = 2000
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await contractFn()
    } catch (e) {
      const isRateLimit = e?.code === -32603 ||
        e?.message?.includes('rate limit') ||
        e?.message?.includes('being rate limited') ||
        e?.message?.includes('coalesce')
      if (!isRateLimit || attempt === maxRetries) throw e
      console.warn(`[sendWithRetry] rate limited, retry ${attempt}/${maxRetries} in ${delay}ms`)
      await new Promise((r) => setTimeout(r, delay))
      delay *= 2
    }
  }
}

/* ── Pyth VAA + fee ──────────────────────────────────────────────────── */
async function getPythData(signer) {
  const pythIds    = MARKETS.map((m) => m.pythId)
  const updateData = await fetchVaas(pythIds)
  /* getUpdateFee is a view call that can fail on some Pyth deployments.
     Fall back to 1 wei — Pyth fee on Base Sepolia testnet is negligible. */
  let fee = 1n
  try {
    const pyth = new Contract(ADDRESSES.PYTH, ABI_PYTH, signer)
    fee = await pyth.getUpdateFee(updateData)
    console.log('[getPythData] updateFee:', fee.toString(), '| VAAs:', updateData.length)
  } catch (e) {
    console.warn('[getPythData] getUpdateFee failed, using 1 wei fallback:', e?.message)
  }
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
      /* Extract clean user-facing message — strip verbose ethers boilerplate */
      const raw = e?.reason || e?.shortMessage || e?.message || ''
      const msg = raw
        ? raw.split(' (action=')[0].split('\n')[0].slice(0, 120)
        : 'Transaction failed'
      console.error('[useTrading] error:', raw)
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

      const owner = await signer.getAddress()
      setStep('Signing permit…')
      /* Spender = PerpCore: openWithPermitAndPriceUpdate lives on PerpCore,
         PerpCore is msg.sender when it calls usdc.permit() and usdc.transferFrom() */
      const { v, r, s, deadline } = await signPermit(signer, ADDRESSES.PERP_CORE, collateralRaw)

      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer)

      /* ── Full pre-submit log ── */
      console.log('[openPosition] ── PRE-SUBMIT ──')
      console.log('  sym        :', sym)
      console.log('  key        :', market.key)
      console.log('  isLong     :', isLong)
      console.log('  leverage   :', leverage, '(type:', typeof leverage, ')')
      console.log('  collateral :', collateralRaw.toString(), '(', collateralUsd, 'USDC )')
      console.log('  reduceOnly : false')
      console.log('  deadline   :', deadline)
      console.log('  v / r / s  :', v, r.slice(0, 18) + '…', s.slice(0, 18) + '…')
      console.log('  updateData :', updateData.length, 'VAAs, first 32B:', updateData[0]?.slice(0, 66))
      console.log('  pythFee    :', fee.toString(), 'wei')
      console.log('  PerpCore   :', ADDRESSES.PERP_CORE)

      const core = new Contract(ADDRESSES.PERP_CORE, ABI_PERP_CORE, signer)
      /* leverage must be a plain integer — ABI declares uint8 */
      const callArgs = [
        market.key, isLong, Number(leverage), collateralRaw, false,
        deadline, v, r, s, updateData,
      ]

      /* ── Static simulation — decode exact revert before broadcasting ── */
      setStep('Simulating…')
      try {
        await core.openWithPermitAndPriceUpdate.staticCall(...callArgs, { value: fee, from: owner })
        console.log('[openPosition] simulation PASSED ✓')
      } catch (simErr) {
        const reason = simErr.reason ?? simErr.shortMessage ?? simErr.message ?? 'unknown revert'
        console.error('[openPosition] SIMULATION FAILED:', reason, simErr)
        /* Rethrow with clean message so the error toast is useful */
        throw new Error(String(reason).split(' (action=')[0].slice(0, 120))
      }

      setStep(`Submitting ${isLong ? 'Long' : 'Short'}…`)
      const tx      = await core.openWithPermitAndPriceUpdate(...callArgs, { value: fee })
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

      const owner = await signer.getAddress()
      setStep('Signing permit…')
      /* Spender must be PerpCore — same as open */
      const { v, r, s, deadline } = await signPermit(signer, ADDRESSES.PERP_CORE, collateralRaw)

      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer)

      const core = new Contract(ADDRESSES.PERP_CORE, ABI_PERP_CORE, signer)

      /* Static simulation — catch permit/position failures before broadcasting */
      setStep('Simulating…')
      try {
        await core.increaseWithPermitAndPriceUpdate.staticCall(
          posId, collateralRaw, deadline, v, r, s, updateData, { value: fee, from: owner }
        )
        console.log('[increasePosition] simulation PASSED ✓')
      } catch (simErr) {
        const reason = simErr.reason ?? simErr.shortMessage ?? simErr.message ?? 'unknown revert'
        console.error('[increasePosition] SIMULATION FAILED:', reason, simErr)
        throw new Error(String(reason).split(' (action=')[0].slice(0, 120))
      }

      setStep('Submitting increase…')
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

      /* Need prior USDC approval for limit orders.
         Use signer.getAddress() — not the cached module-level account —
         to guarantee we check the correct address for the current session. */
      const ownerAddr = await signer.getAddress()
      const usdc = new Contract(ADDRESSES.USDC, ABI_USDC, signer)
      const have = await usdc.allowance(ownerAddr, ADDRESSES.ORDER_MANAGER)
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
      /* Resolve owner address explicitly — used for permit signing,
         staticCall from override, and diagnostics */
      const owner  = await signer.getAddress()
      const amtRaw = parseUnits(String(Number(amountUsd).toFixed(18)), 18)
      setStep('Signing permit…')
      const { v, r, s, deadline } = await signPermit(signer, ADDRESSES.CROSS_MARGIN, amtRaw)
      const cross = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, signer)

      /* ── Pre-simulation diagnostics ────────────────────────────────
         signPermit already logs domain/nonce/owner/value details.
         This block confirms the final assembled args that will be used
         for both simulation and the real tx — they must be identical. */
      console.log('[crossDeposit] ── PRE-SIMULATION ──')
      console.log('  owner    :', owner)
      console.log('  spender  :', ADDRESSES.CROSS_MARGIN, '(permit spender = contract that calls transferFrom)')
      console.log('  amtRaw   :', amtRaw.toString(), '(', Number(amtRaw) / 1e18, 'USDC )')
      console.log('  deadline :', deadline)
      console.log('  v/r/s    :', v, r.slice(0, 18) + '…', s.slice(0, 18) + '…')
      console.log('  contract :', ADDRESSES.CROSS_MARGIN)
      console.log('  fn       : depositWithPermit(uint256 amt, uint256 deadline, uint8 v, bytes32 r, bytes32 s)')
      console.log('  args     : [amtRaw, deadline, v, r, s] — same for simulation and real tx')

      /* Static simulation — pass { from: owner } so msg.sender inside the
         contract is the actual user address, not address(0).
         Without this, the permit check inside depositWithPermit uses
         msg.sender = address(0) → ecrecover mismatch → "invalid signature"
         → simulation fails → real tx is never broadcast. */
      setStep('Simulating deposit…')
      try {
        await cross.depositWithPermit.staticCall(amtRaw, deadline, v, r, s, { from: owner })
        console.log('[crossDeposit] simulation PASSED ✓')
      } catch (simErr) {
        const reason = simErr.reason ?? simErr.shortMessage ?? simErr.message ?? 'unknown revert'
        console.error('[crossDeposit] SIMULATION FAILED:', reason, simErr)
        throw new Error(String(reason).split(' (action=')[0].slice(0, 120))
      }

      console.log('[crossDeposit] ── SUBMITTING ──')
      console.log('  args: [amtRaw, deadline, v, r, s] (same as simulation — no divergence)')
      setStep('Depositing…')
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
      console.log('[crossOpenPosition] key:', market.key, '| isLong:', isLong, '| leverage:', leverage, '| cRaw:', cRaw.toString())
      const tx      = await sendWithRetry(() => cross.openPosition(market.key, isLong, Number(leverage), cRaw, false))
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
