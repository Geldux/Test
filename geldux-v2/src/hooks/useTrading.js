import { useState, useCallback } from 'react'
import { Contract, parseUnits, Signature, TypedDataEncoder, Interface } from 'ethers'
import { ADDRESSES, ABI_USDC, ABI_ORACLE, ABI_PERP_CORE } from '@/config/contracts'
import { CHAIN_ID, PERMIT_DEADLINE_SECONDS, USDC_DECIMALS } from '@/config/chain'
import { MARKETS } from '@/config/markets'
import { getSigner, getAccount, getReadProvider } from './useWallet'
import { fetchVaas, getCurrentPrice } from './usePrices'

/* ── V2 custom error selectors ───────────────────────────────────────── */
const V2_ERRORS = {
  InsufficientPythFee:          '0x',   /* decoded by name */
  SlippageExceeded:             '0x',
  MarketNotEnabled:             '0x',
  PositionAlreadyExists:        '0x',
  PositionNotFound:             '0x',
  InsufficientFreeMargin:       '0x',
  CollateralRemovalUnsafe:      '0x',
  PositionNotLiquidatable:      '0x',
  DepositsPaused:               '0x',
  WithdrawalsPaused:            '0x',
  OpenInterestCapExceeded:      '0x',
  SizeTooLarge:                 '0x',
  LeverageTooHigh:              '0x',
  CollateralTooLow:             '0x',
  MaxCrossPositionsReached:     '0x',
}

/* Build an Interface that can decode V2 custom errors by name */
const _v2ErrorIface = new Interface(
  Object.keys(V2_ERRORS).map((name) => `error ${name}()`)
)

function devAssert(condition, msg) {
  if (!condition) console.error('[useTrading] INVARIANT VIOLATION:', msg)
}

/* ── Permit helper ───────────────────────────────────────────────────── */
async function signPermit(signer, spender, amount) {
  const owner = await signer.getAddress()

  const usdcProv = signer.provider ?? getReadProvider()
  devAssert(!!usdcProv, 'signPermit: no provider available for USDC reads')
  const usdcRead = new Contract(ADDRESSES.USDC, ABI_USDC, usdcProv)

  const [name, onChainVersion, onChainSep] = await Promise.all([
    usdcRead.name().catch(() => 'USD Coin'),
    usdcRead.version().catch(() => null),
    usdcRead.DOMAIN_SEPARATOR().catch(() => null),
  ])

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

  /* GelduxUSDC uses version="1" — try on-chain version first, fall back to "1" */
  const candidates = [
    ...(onChainVersion !== null
      ? [{ name, version: onChainVersion, chainId: CHAIN_ID, verifyingContract: ADDRESSES.USDC }]
      : []),
    { name, version: '1', chainId: CHAIN_ID, verifyingContract: ADDRESSES.USDC },
    { name, version: '2', chainId: CHAIN_ID, verifyingContract: ADDRESSES.USDC },
    { name,               chainId: CHAIN_ID, verifyingContract: ADDRESSES.USDC },
  ]
  let domain = candidates[0]
  if (onChainSep) {
    for (const c of candidates) {
      try {
        const computed = TypedDataEncoder.hashDomain(c)
        if (import.meta.env.DEV) {
          console.log('[signPermit] candidate', JSON.stringify({ ...c, chainId: Number(c.chainId) }), '→', computed)
        }
        if (computed.toLowerCase() === onChainSep.toLowerCase()) {
          domain = c
          if (import.meta.env.DEV) {
            console.log('[signPermit] DOMAIN MATCHED ✓', JSON.stringify({ ...domain, chainId: Number(domain.chainId) }))
          }
          break
        }
      } catch (_) {}
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

  if (import.meta.env.DEV) {
    console.log('[signPermit] domain:', JSON.stringify({ ...domain, chainId: Number(domain.chainId) }))
    console.log('[signPermit] owner:', owner, '| spender:', spender, '| nonce:', nonce.toString())
  }

  const sig   = await signer.signTypedData(domain, types, message)
  const { v, r, s } = Signature.from(sig)
  return { v, r, s, deadline, nonce, domain }
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

/* ── Receipt polling via dedicated read RPC ──────────────────────────── */
async function pollReceipt(provider, txHash, maxWaitMs = 120_000) {
  const deadline = Date.now() + maxWaitMs
  let interval   = 2_000
  while (Date.now() < deadline) {
    let receipt = null
    try {
      receipt = await provider.getTransactionReceipt(txHash)
    } catch (e) {
      if (/rate.?limit|429|coalesce/i.test(e?.message ?? '')) {
        interval = Math.min(interval * 2, 16_000)
        console.warn('[waitTx] receipt poll rate-limited — backing off to', interval / 1000, 's')
      } else {
        throw e
      }
    }
    if (receipt) {
      if (receipt.status === 0) throw new Error('Transaction reverted on-chain.')
      return receipt
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error('Transaction not confirmed after 2 minutes — check the block explorer.')
}

async function waitTx(tx) {
  const rp = getReadProvider()
  if (rp) return pollReceipt(rp, tx.hash)
  const receipt = await tx.wait(1)
  if (receipt?.status === 0) throw new Error('Transaction reverted on-chain.')
  return receipt
}

/* ── Decode V2 custom errors ─────────────────────────────────────────── */
function decodeSimError(err) {
  if (err?.revert?.name) return err.revert.name
  const data = err?.data ?? err?.error?.data ?? ''
  if (typeof data === 'string' && data.length >= 10 && data !== '0x') {
    /* Try to decode V2 custom error by name */
    try {
      const decoded = _v2ErrorIface.parseError(data)
      if (decoded?.name) return decoded.name
    } catch (_) {}
    const selector = data.slice(0, 10)
    console.error('[decodeSimError] raw revert data:', data)
    console.error('[decodeSimError] 4-byte selector:', selector)
    if (err?.reason) return err.reason
    return `Contract error ${selector} — see console for raw revert data`
  }
  return err?.reason ?? err?.shortMessage ?? err?.message ?? 'Simulation reverted'
}

function isInfraError(err) {
  return /rate.?limit|429|coalesce|network|timeout|econnrefused|could not detect/i
    .test(err?.message ?? '')
}

/* ── Pyth VAA + fee (always fresh for trade submissions) ─────────────── */
async function getPythData(signer) {
  const pythIds    = MARKETS.map((m) => m.pythId)
  const updateData = await fetchVaas(pythIds, { fresh: true })
  let fee = 1n
  try {
    const oracle = new Contract(ADDRESSES.ORACLE, ABI_ORACLE, signer)
    fee = await oracle.getUpdateFee(updateData)
  } catch (e) {
    console.warn('[getPythData] getUpdateFee failed, using 1 wei fallback:', e?.message)
  }
  return { updateData, fee }
}

/* ── acceptablePrice with 1% slippage ───────────────────────────────── */
/* Long open / Short close → MAX price (cap, 1% above current mark)     */
/* Short open / Long close → MIN price (floor, 1% below current mark)   */
const SLIPPAGE = 0.01  /* 1% */
function acceptablePrice(sym, isLong, isOpen) {
  const snap  = getCurrentPrice(sym)
  const mid   = snap?.price || 0
  if (!mid) return 0n   /* 0 = no slippage check if oracle unavailable */
  const wantMax = (isLong && isOpen) || (!isLong && !isOpen)
  const price   = wantMax ? mid * (1 + SLIPPAGE) : mid * (1 - SLIPPAGE)
  return parseUnits(price.toFixed(18), 18)
}

/* ── Receipt log parsers ─────────────────────────────────────────────── */
const _coreIface = new Interface([
  'event IsolatedPositionOpened(uint256 indexed posId, address indexed trader, bytes32 indexed market, bool isLong, uint256 collateral, uint256 sizeUsd)',
  'event IsolatedPositionClosed(uint256 indexed posId, address indexed trader, int256 pnl, uint256 payout)',
  'event CrossPositionOpened(uint256 indexed posId, address indexed trader, bytes32 indexed market, bool isLong, uint256 sizeUsd)',
  'event CrossPositionClosed(uint256 indexed posId, address indexed trader, int256 pnl, uint256 payout)',
])
const _erc20Iface = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
])

function parseOpenPosId(receipt) {
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = _coreIface.parseLog(log)
      if (parsed?.name === 'IsolatedPositionOpened') {
        const posId = Number(parsed.args.posId)
        console.log('[parseOpenPosId] IsolatedPositionOpened: posId', posId)
        return posId
      }
    } catch (_) {}
  }
  console.warn('[parseOpenPosId] IsolatedPositionOpened event not found in receipt')
  return null
}

function parseCrossOpenPosId(receipt) {
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = _coreIface.parseLog(log)
      if (parsed?.name === 'CrossPositionOpened') {
        const posId = Number(parsed.args.posId)
        console.log('[parseCrossOpenPosId] CrossPositionOpened: posId', posId)
        return posId
      }
    } catch (_) {}
  }
  return null
}

function parseCloseReceipt(receipt, traderAddr) {
  let pnl = null, payout = null
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = _coreIface.parseLog(log)
      if (parsed?.name === 'IsolatedPositionClosed' || parsed?.name === 'CrossPositionClosed') {
        pnl    = Number(parsed.args.pnl)    / 1e18
        payout = Number(parsed.args.payout) / 1e6
      }
    } catch (_) {}
    if (traderAddr) {
      try {
        const parsed = _erc20Iface.parseLog(log)
        if (parsed?.name === 'Transfer' &&
            parsed.args.to?.toLowerCase() === traderAddr.toLowerCase()) {
          payout = Number(parsed.args.value) / 1e6
        }
      } catch (_) {}
    }
  }
  return { pnl, payout }
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

  /* ── Open isolated position ──────────────────────────────────────── */
  const openPosition = useCallback(async ({ sym, isLong, leverage, collateralUsd }) => {
    return run(`Opening ${isLong ? 'Long' : 'Short'} ${sym}…`, async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const market = MARKETS.find((m) => m.sym === sym)
      if (!market) throw new Error('Unknown market')
      const _col = Number(collateralUsd)
      if (!isFinite(_col) || _col <= 0) throw new Error('Invalid collateral amount')
      const _lev = Number(leverage)
      if (!isFinite(_lev) || _lev < 1) throw new Error('Invalid leverage')
      const owner         = await signer.getAddress()
      const collateralRaw = parseUnits(_col.toFixed(USDC_DECIMALS), USDC_DECIMALS)
      const sizeUsdRaw    = parseUnits((_col * _lev).toFixed(USDC_DECIMALS), USDC_DECIMALS)

      setStep('Signing permit…')
      /* V2: spender = CORE (GelduxPerpCore calls transferFrom on CORE) */
      const { v, r, s, deadline } = await signPermit(signer, ADDRESSES.CORE, collateralRaw)

      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer)
      const accPrice = acceptablePrice(sym, isLong, true)

      console.log('[openPosition]', sym, isLong ? 'LONG' : 'SHORT',
        '| collateral:', collateralRaw.toString(), '| sizeUsd:', sizeUsdRaw.toString(),
        '| acceptablePrice:', accPrice.toString())

      const core     = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
      const callArgs = [
        market.key, isLong, collateralRaw, sizeUsdRaw, accPrice,
        deadline, v, r, s, updateData,
      ]

      setStep('Simulating…')
      try {
        await core.openIsolatedWithPermitAndPriceUpdate.staticCall(...callArgs, { value: fee, from: owner })
        console.log('[openPosition] simulation PASSED ✓')
      } catch (simErr) {
        if (isInfraError(simErr)) {
          console.warn('[openPosition] simulation skipped (infra):', simErr?.message)
        } else {
          throw new Error(decodeSimError(simErr))
        }
      }

      setStep(`Submitting ${isLong ? 'Long' : 'Short'}…`)
      const tx      = await sendWithRetry(() =>
        core.openIsolatedWithPermitAndPriceUpdate(...callArgs, { value: fee })
      )
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      const openedPosId = parseOpenPosId(receipt)
      return { hash: tx.hash, receipt, posId: openedPosId }
    })
  }, [run])

  /* ── Increase isolated position ──────────────────────────────────── */
  const increasePosition = useCallback(async ({ posId, sym, collateralUsd, addLeverage = 0 }) => {
    return run('Increasing position…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const market = MARKETS.find((m) => m.sym === sym)
      if (!market) throw new Error('Unknown market')
      const _col = Number(collateralUsd)
      if (!isFinite(_col) || _col <= 0) throw new Error('Invalid collateral amount')
      const owner         = await signer.getAddress()
      const collateralRaw = parseUnits(_col.toFixed(USDC_DECIMALS), USDC_DECIMALS)
      /* addSizeUsd=0 when not adding leverage, just adding collateral with addIsolatedCollateralWithPermit */
      const addSizeUsdRaw = addLeverage > 0
        ? parseUnits((_col * addLeverage).toFixed(USDC_DECIMALS), USDC_DECIMALS)
        : 0n

      if (addSizeUsdRaw === 0n) {
        /* Pure collateral add — no oracle update needed */
        setStep('Signing permit…')
        const { v, r, s, deadline } = await signPermit(signer, ADDRESSES.CORE, collateralRaw)
        /* Need to know isLong from posId — look up position first */
        const rp   = getReadProvider()
        const core = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, rp ?? signer)
        const pos  = await core.getPosition(posId).catch(() => null)
        const isLong = pos?.isLong ?? true

        setStep('Submitting collateral add…')
        const coreSigner = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
        const tx      = await sendWithRetry(() =>
          coreSigner.addIsolatedCollateralWithPermit(
            market.key, isLong, collateralRaw, deadline, v, r, s
          )
        )
        setStep('Confirming on Base…')
        const receipt = await waitTx(tx)
        return { hash: tx.hash, receipt }
      }

      setStep('Signing permit…')
      const { v, r, s, deadline } = await signPermit(signer, ADDRESSES.CORE, collateralRaw)
      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer)

      /* Need isLong from existing position */
      const rp   = getReadProvider()
      const coreRead = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, rp ?? signer)
      const pos  = await coreRead.getPosition(posId).catch(() => null)
      const isLong = pos?.isLong ?? true
      const accPrice = acceptablePrice(sym, isLong, true)

      const core     = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
      const callArgs = [
        market.key, isLong, collateralRaw, addSizeUsdRaw, accPrice,
        deadline, v, r, s, updateData,
      ]

      setStep('Submitting increase…')
      const tx      = await sendWithRetry(() =>
        core.increaseIsolatedWithPermitAndPriceUpdate(...callArgs, { value: fee })
      )
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Close isolated position ─────────────────────────────────────── */
  const closePosition = useCallback(async ({ posId, sym, isLong }) => {
    return run('Closing position…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const market = MARKETS.find((m) => m.sym === sym)
      if (!market) throw new Error('Unknown market')

      /* Resolve isLong if not provided */
      let _isLong = isLong
      if (_isLong == null) {
        const rp = getReadProvider()
        const coreRead = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, rp ?? signer)
        const pos = await coreRead.getPosition(posId).catch(() => null)
        _isLong = pos?.isLong ?? true
      }

      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer)
      const accPrice = acceptablePrice(sym, _isLong, false)

      setStep('Submitting close…')
      const core = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
      const tx   = await sendWithRetry(() =>
        core.closeIsolatedWithPriceUpdate(market.key, _isLong, accPrice, updateData, { value: fee })
      )
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      const { pnl, payout } = parseCloseReceipt(receipt, getAccount())
      return { hash: tx.hash, receipt, pnl, payout }
    })
  }, [run])

  /* ── Partial close isolated position ────────────────────────────── */
  const partialClosePosition = useCallback(async ({ posId, sym, isLong, closeSizeUsd }) => {
    return run('Partially closing position…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const market = MARKETS.find((m) => m.sym === sym)
      if (!market) throw new Error('Unknown market')
      const _size = Number(closeSizeUsd)
      if (!isFinite(_size) || _size <= 0) throw new Error('Invalid close size')

      let _isLong = isLong
      if (_isLong == null) {
        const rp = getReadProvider()
        const coreRead = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, rp ?? signer)
        const pos = await coreRead.getPosition(posId).catch(() => null)
        _isLong = pos?.isLong ?? true
      }

      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer)
      const accPrice      = acceptablePrice(sym, _isLong, false)
      const closeSizeRaw  = parseUnits(_size.toFixed(USDC_DECIMALS), USDC_DECIMALS)

      setStep('Submitting partial close…')
      const core = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
      const tx   = await sendWithRetry(() =>
        core.partialCloseIsolatedWithPriceUpdate(
          market.key, _isLong, closeSizeRaw, accPrice, updateData, { value: fee }
        )
      )
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      const { pnl, payout } = parseCloseReceipt(receipt, getAccount())
      return { hash: tx.hash, receipt, pnl, payout }
    })
  }, [run])

  /* ── Cross margin deposit (1 sig) ────────────────────────────────── */
  const crossDeposit = useCallback(async ({ amountUsd }) => {
    return run('Depositing to cross margin…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const _amt = Number(amountUsd)
      if (!isFinite(_amt) || _amt <= 0) throw new Error('Invalid deposit amount')
      const owner  = await signer.getAddress()
      const amtRaw = parseUnits(_amt.toFixed(USDC_DECIMALS), USDC_DECIMALS)

      setStep('Signing permit…')
      /* V2: permit spender = CORE */
      const { v, r, s, deadline } = await signPermit(signer, ADDRESSES.CORE, amtRaw)

      console.log('[crossDeposit] owner:', owner, '| amount:', amtRaw.toString(), '| deadline:', deadline)

      setStep('Depositing…')
      const core    = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
      const tx      = await sendWithRetry(() =>
        core.depositCrossWithPermit(amtRaw, deadline, v, r, s, { gasLimit: 400_000 })
      )
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Cross margin withdraw ───────────────────────────────────────── */
  const crossWithdraw = useCallback(async ({ amountUsd }) => {
    return run('Withdrawing from cross margin…', async () => {
      const signer  = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const _amt = Number(amountUsd)
      if (!isFinite(_amt) || _amt <= 0) throw new Error('Invalid withdrawal amount')
      const amtRaw  = parseUnits(_amt.toFixed(USDC_DECIMALS), USDC_DECIMALS)

      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer)

      setStep('Withdrawing…')
      const core    = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
      const tx      = await sendWithRetry(() =>
        core.withdrawCross(amtRaw, updateData, { value: fee, gasLimit: 300_000 })
      )
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Cross open position ─────────────────────────────────────────── */
  const crossOpenPosition = useCallback(async ({ sym, isLong, leverage, collateralUsd }) => {
    return run(`Opening cross ${isLong ? 'Long' : 'Short'} ${sym}…`, async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const market = MARKETS.find((m) => m.sym === sym)
      if (!market) throw new Error('Unknown market')
      const _col = Number(collateralUsd)
      if (!isFinite(_col) || _col <= 0) throw new Error('Invalid collateral amount')
      const _lev = Number(leverage)
      if (!isFinite(_lev) || _lev < 1) throw new Error('Invalid leverage')
      const owner      = await signer.getAddress()
      const sizeUsdRaw = parseUnits((_col * _lev).toFixed(USDC_DECIMALS), USDC_DECIMALS)

      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer)
      const accPrice = acceptablePrice(sym, isLong, true)

      console.log('[crossOpenPosition]', sym, isLong ? 'LONG' : 'SHORT',
        '| sizeUsd:', sizeUsdRaw.toString(), '| acceptablePrice:', accPrice.toString())

      setStep('Simulating…')
      const core = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
      try {
        await core.openCrossWithPriceUpdate.staticCall(
          market.key, isLong, sizeUsdRaw, accPrice, updateData, { value: fee, from: owner }
        )
        console.log('[crossOpenPosition] simulation PASSED ✓')
      } catch (simErr) {
        if (isInfraError(simErr)) {
          console.warn('[crossOpenPosition] simulation skipped (infra):', simErr?.message)
        } else {
          throw new Error(decodeSimError(simErr))
        }
      }

      setStep(`Submitting cross ${isLong ? 'Long' : 'Short'}…`)
      const tx      = await sendWithRetry(() =>
        core.openCrossWithPriceUpdate(
          market.key, isLong, sizeUsdRaw, accPrice, updateData, { value: fee, gasLimit: 500_000 }
        )
      )
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      const openedPosId = parseCrossOpenPosId(receipt)
      return { hash: tx.hash, receipt, posId: openedPosId }
    })
  }, [run])

  /* ── Cross increase position ─────────────────────────────────────── */
  const crossIncreasePosition = useCallback(async ({ posId, sym, isLong, addSizeUsd }) => {
    return run('Increasing cross position…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const market = MARKETS.find((m) => m.sym === sym)
      if (!market) throw new Error('Unknown market')
      const _size = Number(addSizeUsd)
      if (!isFinite(_size) || _size <= 0) throw new Error('Invalid size amount')

      let _isLong = isLong
      if (_isLong == null) {
        const rp = getReadProvider()
        const coreRead = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, rp ?? signer)
        const pos = await coreRead.getPosition(posId).catch(() => null)
        _isLong = pos?.isLong ?? true
      }

      const addSizeRaw = parseUnits(_size.toFixed(USDC_DECIMALS), USDC_DECIMALS)
      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer)
      const accPrice = acceptablePrice(sym, _isLong, true)

      setStep('Submitting increase…')
      const core    = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
      const tx      = await sendWithRetry(() =>
        core.increaseCrossWithPriceUpdate(
          market.key, _isLong, addSizeRaw, accPrice, updateData, { value: fee, gasLimit: 400_000 }
        )
      )
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Cross close position ────────────────────────────────────────── */
  const crossClosePosition = useCallback(async ({ posId, sym, isLong, fractionBps = 10000 }) => {
    return run('Closing cross position…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const market = MARKETS.find((m) => m.sym === sym)
      if (!market) throw new Error('Unknown market')

      let _isLong = isLong
      if (_isLong == null) {
        const rp = getReadProvider()
        const coreRead = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, rp ?? signer)
        const pos = await coreRead.getPosition(posId).catch(() => null)
        _isLong = pos?.isLong ?? true
      }

      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer)
      const accPrice = acceptablePrice(sym, _isLong, false)

      setStep('Submitting close…')
      const core = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)

      let tx
      if (fractionBps >= 10000) {
        tx = await sendWithRetry(() =>
          core.closeCrossWithPriceUpdate(
            market.key, _isLong, accPrice, updateData, { value: fee, gasLimit: 500_000 }
          )
        )
      } else {
        const closeSizeUsd = 0n  /* full close when using closeCross — partial TBD */
        tx = await sendWithRetry(() =>
          core.partialCloseCrossWithPriceUpdate(
            market.key, _isLong, closeSizeUsd, accPrice, updateData, { value: fee, gasLimit: 500_000 }
          )
        )
      }
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      const { pnl, payout } = parseCloseReceipt(receipt, getAccount())
      return { hash: tx.hash, receipt, pnl, payout }
    })
  }, [run])

  /* ── Faucet claim ────────────────────────────────────────────────── */
  const claimFaucet = useCallback(async () => {
    return run('Claiming testnet tokens…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      /* GelduxUSDC.faucet() — no cooldown check needed in V2 */
      const usdc = new Contract(ADDRESSES.USDC, ABI_USDC, signer)
      const tx      = await usdc.faucet({ gasLimit: 120_000 })
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  return {
    pending, step,
    openPosition, increasePosition, closePosition, partialClosePosition,
    crossDeposit, crossWithdraw, crossOpenPosition, crossClosePosition, crossIncreasePosition,
    claimFaucet,
  }
}
