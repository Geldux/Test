import { useState, useCallback } from 'react'
import { Contract, parseUnits, Signature, TypedDataEncoder, Interface } from 'ethers'
import { ADDRESSES, ABI_USDC, ABI_PYTH, ABI_PERP_CORE, ABI_PERP_CONFIG, ABI_PERP_STORE, ABI_ORDER_MANAGER, ABI_CROSS_MARGIN, ABI_FAUCET } from '@/config/contracts'
import { CHAIN_ID, PERMIT_DEADLINE_SECONDS } from '@/config/chain'
import { MARKETS } from '@/config/markets'
import { getSigner, getAccount, getReadProvider } from './useWallet'
import { fetchVaas, getCurrentPrice } from './usePrices'

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

  /* Fetch name, version, and on-chain DOMAIN_SEPARATOR in parallel.
     version() may not exist on all tokens — catch and treat as null. */
  const [name, onChainVersion, onChainSep] = await Promise.all([
    usdcRead.name().catch(() => 'USD Coin'),
    usdcRead.version().catch(() => null),
    usdcRead.DOMAIN_SEPARATOR().catch(() => null),
  ])

  if (onChainVersion !== null) {
    console.log('[signPermit] version() on-chain:', JSON.stringify(onChainVersion))
  } else {
    console.warn('[signPermit] version() call failed — will try hardcoded candidates 1, 2, and no-version')
  }

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
       1. Actual on-chain version() string — most reliable if available
       2. version='1'  (most custom tokens)
       3. version='2'  (Circle USDC on mainnet)
       4. no version field (some minimal ERC-2612 implementations)
  */
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
    if (domain === candidates[0] && onChainVersion === null) {
      console.warn('[signPermit] ⚠ no candidate matched on-chain separator — using version=1 as default')
    } else if (domain === candidates[0] && onChainVersion !== null) {
      console.log('[signPermit] using on-chain version as domain (matched or first candidate)')
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
/* tx.wait(1) polls through BrowserProvider (MetaMask) whose configured   */
/* public RPC rate-limits eth_getTransactionReceipt → "coalesce" errors.  */
/* This replaces it with explicit polling against our JsonRpcProvider.    */
async function pollReceipt(provider, txHash, maxWaitMs = 120_000) {
  const deadline = Date.now() + maxWaitMs
  let interval   = 2_000   /* start 2s; exponential backoff on 429 */
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

/* ── Wait for receipt ────────────────────────────────────────────────── */
async function waitTx(tx) {
  const rp = getReadProvider()
  /* Prefer dedicated JsonRpcProvider; fall back to BrowserProvider only if no RPC configured */
  if (rp) return pollReceipt(rp, tx.hash)
  const receipt = await tx.wait(1)
  if (receipt?.status === 0) throw new Error('Transaction reverted on-chain.')
  return receipt
}

/* ── Decode simulation error ─────────────────────────────────────────── */
/* Returns the most human-readable error name/reason available.           */
/* Priority: ethers-decoded custom error name → string revert reason →    */
/* raw 4-byte selector (fallback when the error ABI is incomplete).       */
function decodeSimError(err) {
  /* ethers v6: if the error ABI is present, err.revert = { name, args } */
  if (err?.revert?.name) return err.revert.name
  const data = err?.data ?? err?.error?.data ?? ''
  if (typeof data === 'string' && data.length >= 10 && data !== '0x') {
    const selector = data.slice(0, 10)
    console.error('[decodeSimError] raw revert data:', data)
    console.error('[decodeSimError] 4-byte selector:', selector)
    if (err?.reason) return err.reason
    return `Contract error ${selector} — see console for raw revert data`
  }
  return err?.reason ?? err?.shortMessage ?? err?.message ?? 'Simulation reverted'
}

/* ── Receipt log parsers ─────────────────────────────────────────────── */
const _coreIface = new Interface([
  'event Opened(uint256 indexed posId, address indexed owner, bytes32 indexed key, bool isLong, uint8 leverage, uint256 collateral)',
  'event Closed(uint256 indexed posId, int256 pnl)',
])
const _erc20Iface = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
])

function parseOpenPosId(receipt) {
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = _coreIface.parseLog(log)
      if (parsed?.name === 'Opened') {
        const posId = Number(parsed.args.posId)
        console.log('[parseOpenPosId] Opened event: posId', posId)
        return posId
      }
    } catch (_) {}
  }
  console.warn('[parseOpenPosId] Opened event not found in receipt')
  return null
}

/* Parse on-chain PnL and USDC payout from a close receipt.
   pnl from Closed(posId, int256 pnl) — 18-decimal int256.
   payout from USDC Transfer(vault → trader) — 18-decimal uint256. */
function parseCloseReceipt(receipt, traderAddr) {
  let pnl = null, payout = null
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = _coreIface.parseLog(log)
      if (parsed?.name === 'Closed') {
        pnl = Number(parsed.args.pnl) / 1e18
        console.log('[parseCloseReceipt] Closed event: posId', parsed.args.posId?.toString(), '| pnl', pnl)
      }
    } catch (_) {}
    if (traderAddr) {
      try {
        const parsed = _erc20Iface.parseLog(log)
        if (parsed?.name === 'Transfer' &&
            parsed.args.to?.toLowerCase() === traderAddr.toLowerCase()) {
          payout = Number(parsed.args.value) / 1e18
          console.log('[parseCloseReceipt] USDC Transfer to trader:', payout)
        }
      } catch (_) {}
    }
  }
  console.log('[parseCloseReceipt] summary — pnl:', pnl, '| USDC payout:', payout)
  return { pnl, payout }
}

/* ── Classify simulation failure: infrastructure vs contract revert ───── */
function isInfraError(err) {
  return /rate.?limit|429|coalesce|network|timeout|econnrefused|could not detect/i
    .test(err?.message ?? '')
}

/* ── Pyth VAA + fee ──────────────────────────────────────────────────── */
/* fresh=true (default): always fetches a new VAA from Hermes — required for
   all isolated trade submissions so execution price matches display price.
   fresh=false: may reuse 8-s cached data (cross StalePrice retry path). */
async function getPythData(signer, { fresh = true } = {}) {
  const pythIds    = MARKETS.map((m) => m.pythId)
  const updateData = await fetchVaas(pythIds, { fresh })
  /* getUpdateFee is a view call that can fail on some Pyth deployments.
     Fall back to 1 wei — Pyth fee on Base Sepolia testnet is negligible. */
  let fee = 1n
  try {
    const pyth = new Contract(ADDRESSES.PYTH, ABI_PYTH, signer)
    fee = await pyth.getUpdateFee(updateData)
    console.log('[getPythData] updateFee:', fee.toString(), '| VAAs:', updateData.length, '| fresh:', fresh)
  } catch (e) {
    console.warn('[getPythData] getUpdateFee failed, using 1 wei fallback:', e?.message)
  }
  return { updateData, fee }
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
      const market        = MARKETS.find((m) => m.sym === sym)
      if (!market) throw new Error('Unknown market')
      const owner         = await signer.getAddress()
      const collateralRaw = parseUnits(String(Number(collateralUsd).toFixed(18)), 18)

      setStep('Signing permit…')
      /* Spender = PerpVault: openWithPermitAndPriceUpdate routes USDC into PerpVault
         internally — the contract calls USDC.permit(msg.sender, PERP_VAULT, collateral, ...)
         and USDC.transferFrom(msg.sender, PERP_VAULT, collateral).
         The permit spender must be whoever calls transferFrom, which is PerpVault. */
      const { v, r, s, deadline, nonce, domain } = await signPermit(signer, ADDRESSES.PERP_VAULT, collateralRaw)

      setStep('Fetching oracle price…')
      /* Always fetch a fresh VAA for isolated opens — never reuse cache.
         The 8-s VAA cache would allow the displayed mark price (updated by
         fetchHermesPrices every 8 s) to get ahead of the stale execution
         price, making every long open appear instantly profitable. */
      const { updateData, fee } = await getPythData(signer, { fresh: true })

      /* Capture execution snapshot immediately after fresh VAA fetch.
         getCurrentPrice() now reflects the exact price embedded in the VAA
         that will be submitted to the contract. */
      const execSnap  = getCurrentPrice(sym)
      const execNowS  = Math.floor(Date.now() / 1000)
      const execVaaAge = execSnap?.publishTime ? execNowS - execSnap.publishTime : null

      console.log('[openPosition] ── EXECUTION VAA ──')
      console.log('  sym / direction    :', sym, isLong ? 'LONG' : 'SHORT')
      console.log('  VAA price          :', execSnap?.price)
      console.log('  VAA publishTime    :', execSnap?.publishTime)
      console.log('  VAA age            :', execVaaAge != null ? execVaaAge + 's' : 'n/a')
      console.log('  markLong (ask)     :', execSnap?.markLong,  '← expected entry for longs')
      console.log('  markShort (bid)    :', execSnap?.markShort, '← expected entry for shorts')
      console.log('  expected entry     :', isLong ? execSnap?.markLong : execSnap?.markShort)
      console.log('  collateral / lev   :', collateralUsd, '/', Number(leverage), '× → notional', collateralUsd * Number(leverage))
      if (execVaaAge != null && execVaaAge > 10) {
        console.warn('[openPosition] ⚠ VAA is', execVaaAge, 's old — entry may diverge from current mark; consider refetch')
      }

      console.log('[openPosition] ── PRE-SUBMIT ──')
      console.log('  owner     :', owner, '| spender:', ADDRESSES.PERP_VAULT, '(PERP_VAULT)')
      console.log('  nonce     :', nonce.toString(), '| deadline:', deadline)
      console.log('  value     :', collateralRaw.toString(), '(', collateralUsd, 'USDC)')
      console.log('  domain    :', JSON.stringify({ ...domain, chainId: Number(domain.chainId) }))
      console.log('  key/long/lev:', market.key, isLong, Number(leverage))
      console.log('  v / r / s :', v, r.slice(0, 18) + '…', s.slice(0, 18) + '…')

      const core     = new Contract(ADDRESSES.PERP_CORE, ABI_PERP_CORE, signer)
      const callArgs = [market.key, isLong, Number(leverage), collateralRaw, false, deadline, v, r, s, updateData]

      /* Blocking simulation — surfaces actual revert reason before broadcasting. */
      setStep('Simulating…')
      try {
        await core.openWithPermitAndPriceUpdate.staticCall(...callArgs, { value: fee, from: owner })
        console.log('[openPosition] simulation PASSED ✓')
      } catch (simErr) {
        if (isInfraError(simErr)) {
          console.warn('[openPosition] simulation skipped (infra) — submitting anyway:', simErr?.message)
        } else {
          throw new Error(decodeSimError(simErr))
        }
      }

      setStep(`Submitting ${isLong ? 'Long' : 'Short'}…`)
      const tx      = await core.openWithPermitAndPriceUpdate(...callArgs, { value: fee })
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      const openedPosId = parseOpenPosId(receipt)

      /* Non-blocking post-open audit: compare stored entry vs execution VAA and marks. */
      if (openedPosId != null) {
        const rp2 = getReadProvider()
        if (rp2) {
          const store2 = new Contract(ADDRESSES.PERP_STORE, ABI_PERP_STORE, rp2)
          const cfg2   = new Contract(ADDRESSES.PERP_CONFIG, ABI_PERP_CONFIG, rp2)
          Promise.all([
            store2.getPosition(openedPosId),
            cfg2.getMarkPrice(market.key, true),
            cfg2.getMarkPrice(market.key, false),
            cfg2.feeBps(),
          ]).then(([storedPos, markLongRaw, markShortRaw, feeBpsRaw]) => {
            const entry  = Number(storedPos.entryPrice) / 1e18
            const mL     = Number(markLongRaw)  / 1e18
            const mS     = Number(markShortRaw) / 1e18
            console.log('[openPosition] ── POST-OPEN PRICE AUDIT ──')
            console.log('  posId                     :', openedPosId)
            console.log('  stored entryPrice          :', entry)
            console.log('  execution VAA price        :', execSnap?.price, '(submitted)')
            console.log('  getMarkPrice(key, true)    :', mL, '← long mark (post-open read)')
            console.log('  getMarkPrice(key, false)   :', mS, '← short mark (post-open read)')
            console.log('  spread markLong-markShort  :', (mL - mS).toFixed(6), '=', ((mL - mS) / (mS || 1) * 100).toFixed(4) + '%')
            console.log('  entry vs execution VAA     :', execSnap?.price ? (entry - execSnap.price).toFixed(6) : 'n/a', 'diff')
            console.log('  entry vs markLong          :', (entry - mL).toFixed(6), 'diff')
            console.log('  entry vs markShort         :', (entry - mS).toFixed(6), 'diff')
            console.log('  feeBps                     :', Number(feeBpsRaw), '=', (Number(feeBpsRaw) / 100).toFixed(3) + '%')
            if (Math.abs(entry - (isLong ? mL : mS)) / (isLong ? mL : mS) > 0.001) {
              console.warn('[openPosition] ⚠ entry differs from expected mark by >0.1% — check contract mark formula vs VAA price')
            }
          }).catch((e) => console.warn('[openPosition] post-open audit read failed:', e?.message))
        }
      }

      return { hash: tx.hash, receipt, posId: openedPosId }
    })
  }, [run])

  /* ── Increase isolated position (1 signature) ───────────────────── */
  const increasePosition = useCallback(async ({ posId, sym, collateralUsd }) => {
    return run('Increasing position…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const owner         = await signer.getAddress()
      const collateralRaw = parseUnits(String(Number(collateralUsd).toFixed(18)), 18)

      setStep('Signing permit…')
      /* Spender = PerpVault: same as openPosition — extra collateral routes into PerpVault */
      const { v, r, s, deadline, nonce, domain } = await signPermit(signer, ADDRESSES.PERP_VAULT, collateralRaw)

      setStep('Fetching oracle price…')
      const { updateData, fee } = await getPythData(signer, { fresh: true })

      const core = new Contract(ADDRESSES.PERP_CORE, ABI_PERP_CORE, signer)
      /* Shared args — simulation and submit always use the identical payload */
      const callArgs = [posId, collateralRaw, deadline, v, r, s, updateData]

      /* ── Full pre-submit diagnostics ── */
      console.log('[increasePosition] ── PRE-SUBMIT ──')
      console.log('  owner             :', owner)
      console.log('  spender           :', ADDRESSES.PERP_VAULT, '(PERP_VAULT)')
      console.log('  nonce             :', nonce.toString())
      console.log('  deadline          :', deadline)
      console.log('  signed value      :', collateralRaw.toString(), '(', collateralUsd, 'USDC )')
      console.log('  chainId           :', CHAIN_ID)
      console.log('  token name        :', domain.name)
      console.log('  version           :', domain.version ?? '(none)')
      console.log('  verifyingContract :', domain.verifyingContract)
      console.log('  tx target         :', ADDRESSES.PERP_CORE, '(PERP_CORE)')
      console.log('  function          : increaseWithPermitAndPriceUpdate')
      console.log('  posId             :', posId.toString())
      console.log('  collateral        :', collateralRaw.toString(), '(', collateralUsd, 'USDC )')
      console.log('  v / r / s         :', v, r.slice(0, 18) + '…', s.slice(0, 18) + '…')
      console.log('  updateData        :', updateData.length, 'VAAs')
      console.log('  pythFee           :', fee.toString(), 'wei')
      console.log('  callArgs          :', posId.toString(), collateralRaw.toString(), deadline)
      console.log('  ──────────────────────────────────────────────────────')

      /* Diagnostic simulation only — never blocks submission */
      core.increaseWithPermitAndPriceUpdate.staticCall(...callArgs, { value: fee, from: owner })
        .then(() => console.log('[increasePosition] simulation PASSED ✓'))
        .catch((simErr) => {
          const reason = simErr.reason ?? simErr.shortMessage ?? simErr.message ?? 'unknown revert'
          console.warn('[increasePosition] simulation diagnostic:', String(reason).split(' (action=')[0].slice(0, 120), simErr)
        })

      setStep('Submitting increase…')
      /* No leverage param — contract reads it from the existing position struct */
      const tx      = await core.increaseWithPermitAndPriceUpdate(...callArgs, { value: fee })
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
      const { updateData, fee } = await getPythData(signer, { fresh: true })
      const closeSnap  = getCurrentPrice(sym)
      const closeNowS  = Math.floor(Date.now() / 1000)
      const closeVaaAge = closeSnap?.publishTime ? closeNowS - closeSnap.publishTime : null
      console.log('[closePosition] ── EXECUTION VAA ──')
      console.log('  posId            :', posId)
      console.log('  sym              :', sym)
      console.log('  VAA price        :', closeSnap?.price)
      console.log('  VAA publishTime  :', closeSnap?.publishTime)
      console.log('  VAA age          :', closeVaaAge != null ? closeVaaAge + 's' : 'n/a')
      console.log('  markLong (ask)   :', closeSnap?.markLong)
      console.log('  markShort (bid)  :', closeSnap?.markShort)
      if (closeVaaAge != null && closeVaaAge > 10) {
        console.warn('[closePosition] ⚠ VAA is', closeVaaAge, 's old')
      }

      setStep('Submitting close…')
      const core = new Contract(ADDRESSES.PERP_CORE, ABI_PERP_CORE, signer)
      const tx   = await core.closeWithPriceUpdate(posId, updateData, { value: fee })
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      const { pnl, payout } = parseCloseReceipt(receipt, getAccount())
      return { hash: tx.hash, receipt, pnl, payout }
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

      console.log('[createLimitOrder] ── PRE-SUBMIT ──')
      console.log('  owner      :', ownerAddr)
      console.log('  spender    :', ADDRESSES.ORDER_MANAGER, '(ORDER_MANAGER)')
      console.log('  cRaw       :', cRaw.toString(), '(', collateralUsd, 'USDC )')
      console.log('  allowance  :', have.toString(), have >= cRaw ? '✓ sufficient' : '✗ need approval')
      console.log('  market key :', market.key, '|', sym)
      console.log('  isLong     :', isLong, '| leverage:', leverage)
      console.log('  triggerRaw :', tRaw.toString(), '(', triggerPrice, ')')

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
      console.log('[createLimitOrder]  execFee    :', minFee.toString(), 'wei')
      console.log('[createLimitOrder]  callArgs   :', market.key, isLong, leverage, cRaw.toString(), false, tRaw.toString())

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

      /* Non-blocking diagnostic simulation — never throws; tx is always submitted. */
      const rpDep    = getReadProvider()
      const crossDep = rpDep ? new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, rpDep) : cross
      crossDep.depositWithPermit.staticCall(amtRaw, deadline, v, r, s, { from: owner })
        .then(() => console.log('[crossDeposit] simulation PASSED ✓'))
        .catch((simErr) => {
          const reason = decodeSimError(simErr)
          console.warn('[crossDeposit] simulation diagnostic:', reason, simErr)
        })

      console.log('[crossDeposit] ── SUBMITTING ──')
      console.log('  args: [amtRaw, deadline, v, r, s] (same as simulation — no divergence)')
      setStep('Depositing…')
      const tx      = await cross.depositWithPermit(amtRaw, deadline, v, r, s, { gasLimit: 400_000 })
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
      const tx      = await cross.withdraw(amtRaw, { gasLimit: 300_000 })
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
      const { updateData, fee } = await getPythData(signer, { fresh: true })

      setStep('Submitting partial close…')
      const core = new Contract(ADDRESSES.PERP_CORE, ABI_PERP_CORE, signer)
      const deltaRaw = parseUnits(String(Number(collateralDelta).toFixed(18)), 18)
      const tx   = await core.partialCloseWithPriceUpdate(posId, deltaRaw, updateData, { value: fee })
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      const { pnl, payout } = parseCloseReceipt(receipt, getAccount())
      return { hash: tx.hash, receipt, pnl, payout }
    })
  }, [run])

  /* ── Cross margin increase position ────────────────────────────── */
  /* Draws extra collateral from the trader's existing cross-margin   */
  /* account balance — no permit needed.                              */
  const crossIncreasePosition = useCallback(async ({ posId, collateralUsd }) => {
    return run('Increasing cross position…', async () => {
      const signer   = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const extraRaw = parseUnits(String(Number(collateralUsd).toFixed(18)), 18)
      const owner    = await signer.getAddress()
      const cross    = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, signer)

      console.log('[crossIncreasePosition] posId:', posId.toString(), '| extra:', extraRaw.toString(), '(', collateralUsd, 'USDC)')

      /* increasePosition reads on-chain Pyth price — same StalePrice() risk as open/close. */
      setStep('Simulating…')
      let needsPythUpdate = false
      try {
        await cross.increasePosition.staticCall(posId, extraRaw, { from: owner })
        console.log('[crossIncreasePosition] pre-Pyth simulation PASSED ✓')
      } catch (simErr) {
        if (isInfraError(simErr)) {
          console.warn('[crossIncreasePosition] simulation skipped (infra):', simErr?.message)
        } else {
          const reason  = decodeSimError(simErr)
          const rawData = simErr?.data ?? simErr?.error?.data ?? ''
          const isStale = /stale|price.?age|too.?old|StalePrice/i.test(reason) ||
                          /stale|price.?age|too.?old|StalePrice/i.test(simErr?.message ?? '') ||
                          rawData.startsWith('0x19abf40e')
          if (isStale) {
            console.log('[crossIncreasePosition] StalePrice detected — will update Pyth and retry')
            needsPythUpdate = true
          } else {
            throw new Error(reason)
          }
        }
      }

      if (needsPythUpdate) {
        setStep('Updating oracle price…')
        const { updateData, fee } = await getPythData(signer)
        const pyth    = new Contract(ADDRESSES.PYTH, ABI_PYTH, signer)
        const priceTx = await pyth.updatePriceFeeds(updateData, { value: fee })
        setStep('Confirming oracle update…')
        await waitTx(priceTx)
        console.log('[crossIncreasePosition] Pyth price update confirmed ✓')

        setStep('Re-simulating…')
        try {
          await cross.increasePosition.staticCall(posId, extraRaw, { from: owner })
          console.log('[crossIncreasePosition] post-Pyth simulation PASSED ✓')
        } catch (simErr2) {
          if (!isInfraError(simErr2)) throw new Error(decodeSimError(simErr2))
          console.warn('[crossIncreasePosition] post-Pyth simulation skipped (infra):', simErr2?.message)
        }
      }

      setStep('Submitting increase…')
      const tx      = await cross.increasePosition(posId, extraRaw, { gasLimit: 400_000 })
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Cross margin open position ──────────────────────────────────── */
  const crossOpenPosition = useCallback(async ({ sym, isLong, leverage, collateralUsd }) => {
    return run(`Opening cross ${isLong ? 'Long' : 'Short'} ${sym}…`, async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const market = MARKETS.find((m) => m.sym === sym)
      if (!market) throw new Error('Unknown market')
      const owner  = await signer.getAddress()
      const cRaw   = parseUnits(String(Number(collateralUsd).toFixed(18)), 18)
      const cross  = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, signer)

      console.log('[crossOpenPosition] ── PRE-SUBMIT ──')
      console.log('  owner    :', owner)
      console.log('  market   :', market.key, '|', sym)
      console.log('  isLong   :', isLong)
      console.log('  leverage :', Number(leverage))
      console.log('  cRaw     :', cRaw.toString(), '(', collateralUsd, 'USDC)')
      console.log('  contract :', ADDRESSES.CROSS_MARGIN)

      /* Account balance pre-check */
      setStep('Checking account balance…')
      try {
        const [balance] = await cross.getAccount(owner)
        console.log('[crossOpenPosition] account balance:', balance.toString(), '| required:', cRaw.toString())
        if (balance < cRaw) {
          throw new Error(
            `Insufficient cross-margin balance: have ${(Number(balance) / 1e18).toFixed(4)} USDC, need ${(Number(cRaw) / 1e18).toFixed(4)} USDC — deposit more first.`
          )
        }
      } catch (balErr) {
        if (balErr.message.startsWith('Insufficient')) throw balErr
        console.warn('[crossOpenPosition] getAccount failed, continuing:', balErr?.message)
      }

      /* Simulate first — StalePrice() = selector 0x19abf40e.
         Any non-staleness revert is surfaced immediately without wasting a Pyth update tx. */
      setStep('Simulating…')
      let needsPythUpdate = false
      try {
        await cross.openPosition.staticCall(market.key, isLong, Number(leverage), cRaw, false, { from: owner })
        console.log('[crossOpenPosition] pre-Pyth simulation PASSED ✓ — no oracle update needed')
      } catch (simErr) {
        if (isInfraError(simErr)) {
          console.warn('[crossOpenPosition] simulation skipped (infra):', simErr?.message)
        } else {
          const reason  = decodeSimError(simErr)
          const rawData = simErr?.data ?? simErr?.error?.data ?? ''
          const isStale = /stale|price.?age|too.?old|StalePrice/i.test(reason) ||
                          /stale|price.?age|too.?old|StalePrice/i.test(simErr?.message ?? '') ||
                          rawData.startsWith('0x19abf40e')
          if (isStale) {
            console.log('[crossOpenPosition] StalePrice detected — will update Pyth and retry')
            needsPythUpdate = true
          } else {
            throw new Error(reason)
          }
        }
      }

      if (needsPythUpdate) {
        setStep('Updating oracle price…')
        const { updateData, fee } = await getPythData(signer)
        const pyth    = new Contract(ADDRESSES.PYTH, ABI_PYTH, signer)
        const priceTx = await pyth.updatePriceFeeds(updateData, { value: fee })
        setStep('Confirming oracle update…')
        await waitTx(priceTx)
        console.log('[crossOpenPosition] Pyth price update confirmed ✓')

        setStep('Re-simulating…')
        try {
          await cross.openPosition.staticCall(market.key, isLong, Number(leverage), cRaw, false, { from: owner })
          console.log('[crossOpenPosition] post-Pyth simulation PASSED ✓')
        } catch (simErr2) {
          if (!isInfraError(simErr2)) throw new Error(decodeSimError(simErr2))
          console.warn('[crossOpenPosition] post-Pyth simulation skipped (infra):', simErr2?.message)
        }
      }

      setStep(`Submitting cross ${isLong ? 'Long' : 'Short'}…`)
      const tx      = await cross.openPosition(market.key, isLong, Number(leverage), cRaw, false, { gasLimit: 500_000 })
      setStep('Confirming on Base…')
      const receipt = await waitTx(tx)
      return { hash: tx.hash, receipt }
    })
  }, [run])

  /* ── Cross margin close position ─────────────────────────────────── */
  const crossClosePosition = useCallback(async ({ posId, fractionBps = 10000 }) => {
    return run('Closing cross position…', async () => {
      const signer = getSigner()
      if (!signer) throw new Error('Wallet not connected')
      const owner  = await signer.getAddress()
      const cross  = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, signer)

      console.log('[crossClosePosition] ── PRE-SUBMIT ──')
      console.log('  owner       :', owner)
      console.log('  posId       :', posId.toString())
      console.log('  fractionBps :', fractionBps, '(', (fractionBps / 100).toFixed(0), '%)')
      console.log('  contract    :', ADDRESSES.CROSS_MARGIN)

      /* closePosition reads on-chain Pyth price — same StalePrice() risk. */
      setStep('Simulating…')
      let needsPythUpdate = false
      try {
        await cross.closePosition.staticCall(posId, fractionBps, { from: owner })
        console.log('[crossClosePosition] pre-Pyth simulation PASSED ✓')
      } catch (simErr) {
        if (isInfraError(simErr)) {
          console.warn('[crossClosePosition] simulation skipped (infra):', simErr?.message)
        } else {
          const reason  = decodeSimError(simErr)
          const rawData = simErr?.data ?? simErr?.error?.data ?? ''
          const isStale = /stale|price.?age|too.?old|StalePrice/i.test(reason) ||
                          /stale|price.?age|too.?old|StalePrice/i.test(simErr?.message ?? '') ||
                          rawData.startsWith('0x19abf40e')
          if (isStale) {
            console.log('[crossClosePosition] StalePrice detected — will update Pyth and retry')
            needsPythUpdate = true
          } else {
            throw new Error(reason)
          }
        }
      }

      if (needsPythUpdate) {
        setStep('Updating oracle price…')
        const { updateData, fee } = await getPythData(signer)
        const pyth    = new Contract(ADDRESSES.PYTH, ABI_PYTH, signer)
        const priceTx = await pyth.updatePriceFeeds(updateData, { value: fee })
        setStep('Confirming oracle update…')
        await waitTx(priceTx)
        console.log('[crossClosePosition] Pyth price update confirmed ✓')

        setStep('Re-simulating…')
        try {
          await cross.closePosition.staticCall(posId, fractionBps, { from: owner })
          console.log('[crossClosePosition] post-Pyth simulation PASSED ✓')
        } catch (simErr2) {
          if (!isInfraError(simErr2)) throw new Error(decodeSimError(simErr2))
          console.warn('[crossClosePosition] post-Pyth simulation skipped (infra):', simErr2?.message)
        }
      }

      setStep('Submitting close…')
      const tx      = await cross.closePosition(posId, fractionBps, { gasLimit: 500_000 })
      setStep('Confirming on Base…')
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
