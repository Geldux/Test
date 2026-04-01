/**
 * perp.js
 *
 * PerpDEX trading logic: open, close, and liquidity check.
 *
 * Extracted from legacy/index.html — behaviour preserved exactly.
 * No UI wiring.
 *
 * Public API
 *   perpOpen(sym, isLong, lev, colUSD, setStep)  open a leveraged position
 *   perpClose(posId)                              close an existing position
 *   checkPerpLiquidity()                          'ok' | 'empty'
 */

import { parseUnits, formatUnits, Interface, Contract } from 'ethers'
import { ADDRESSES, MARKET_KEYS, USDC_DECIMALS } from './config.js'
import { ABI_PERP } from './contracts.js'
import { getReadProvider, cPERP, cUSDC } from './wallet.js'
import { pollPyth, getEncodedVaas, isPythFresh, submitPythUpdate } from './oracle.js'
import { waitTx, doApprove } from './tx.js'

// Pre-built interface for log parsing (avoids repeated construction).
const _perpIface = new Interface(ABI_PERP)

// ── perpOpen ──────────────────────────────────────────────────────────────
// Opens a leveraged perpetual position.
//
// Steps (mirrors legacy perpOpen):
//   1  assetActive check — throws 'Market inactive' if contract confirms inactive;
//                          continues on RPC error (don't block on degraded RPC)
//   2  doApprove         — approve PERP for raw USDC collateral
//   3  getEncodedVaas()  — throws 'Cannot fetch Pyth price' if null
//   4  isPythFresh check — uses 1-tx path (gasLimit 300 000) if fresh,
//                          2-tx path (submitPythUpdate then open, 350 000) if stale
//   5  open()            — parse posId from Opened event log
//   6  waitTx            — poll receipt
//
// Returns { hash, posId } on success.
// `setStep` is a UI callback (step number string); callers may pass a no-op.
//
// Mirrors legacy async function perpOpen(sym, isLong, lev, colUSD).

export async function perpOpen(sym, isLong, lev, colUSD, setStep = () => {}) {
  const key = MARKET_KEYS[sym]
  if (!key) throw new Error(`[perp] Unknown symbol: ${sym}`)

  setStep('1')

  // assetActive — throw only on confirmed false; ignore RPC errors.
  try {
    const rp = getReadProvider()
    if (rp) {
      const rc     = new Contract(ADDRESSES.PERP, ABI_PERP, rp)
      const active = await rc.assetActive(key)
      if (!active) throw new Error('Market inactive')
    }
  } catch (er) {
    if (er.message === 'Market inactive') throw er
    // other RPC errors — continue
  }

  setStep('2')

  const raw = parseUnits(Number(colUSD).toFixed(6), USDC_DECIMALS)
  await doApprove(ADDRESSES.PERP, raw)

  setStep('3')

  const enc = await getEncodedVaas()
  if (!enc) throw new Error('Cannot fetch Pyth price. Try again.')

  const fresh = await isPythFresh(key)

  let tx
  if (fresh) {
    setStep('4')
    tx = await cPERP().open(key, isLong, lev, raw, { gasLimit: 300000 })
  } else {
    setStep('4')
    await submitPythUpdate()   // unawaited in the contract sense — waitTx handles it
    setStep('5')
    tx = await cPERP().open(key, isLong, lev, raw, { gasLimit: 350000 })
  }

  setStep('6')
  const receipt = await waitTx(tx)

  // Parse posId from the Opened event in the receipt logs.
  let posId = null
  try {
    for (const log of receipt.logs || []) {
      const parsed = _perpIface.parseLog(log)
      if (parsed && parsed.name === 'Opened') {
        posId = parsed.args[0].toString()
        break
      }
    }
  } catch (_e) {
    // posId remains null — caller may handle
  }

  return { hash: receipt.transactionHash || tx.hash, posId }
}

// ── perpClose ─────────────────────────────────────────────────────────────
// Closes position `posId`.
//
// Steps (mirrors legacy perpClose):
//   1  pollPyth()     — soft refresh (errors swallowed)
//   2  getPosition()  — fetch assetKey for the given posId
//   3  isPythFresh()  — submitPythUpdate() if stale
//   4  close() retry  — up to 3 attempts; retries on 429/rate-limit/
//                       coalesce/UNKNOWN_ERROR with `4000 + att*2000` ms delay
//
// Returns the transaction hash on success.
// Throws a descriptive error for common failure modes (missing revert data,
// estimateGas failures).
//
// Mirrors legacy async function perpClose(posId).

export async function perpClose(posId) {
  // Soft-refresh prices — errors must not block close.
  await pollPyth().catch(() => {})

  // Resolve assetKey for this position.
  let assetKey
  try {
    const rp = getReadProvider()
    if (rp) {
      const rc = new Contract(ADDRESSES.PERP, ABI_PERP, rp)
      const p  = await rc.getPosition(posId)
      assetKey = p[1]
    }
  } catch (_e) {
    // proceed without freshness check
  }

  if (assetKey) {
    const fresh = await isPythFresh(assetKey)
    if (!fresh) {
      await submitPythUpdate()
    }
  }

  // Retry loop — up to 3 attempts.
  const MAX_ATTEMPTS = 3
  let txSent = null

  for (let att = 1; att <= MAX_ATTEMPTS; att++) {
    try {
      const tx = await cPERP().close(posId, { gasLimit: 300000 })
      txSent = tx
      break
    } catch (er) {
      const msg  = (er.message || '').toLowerCase()
      const code = er.code || ''

      // Unrecoverable: contract explicitly reverted with reason.
      if (msg.includes('missing revert data') || msg.includes('estimategas')) {
        throw new Error(
          'Position already closed or liquidated. Refresh your positions.',
        )
      }

      const retryable =
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('coalesce') ||
        code === 'UNKNOWN_ERROR'

      if (!retryable || att === MAX_ATTEMPTS) throw er

      const delay = 4000 + att * 2000
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  if (!txSent) throw new Error('[perp] close: no transaction sent')

  const receipt = await waitTx(txSent)
  return receipt.transactionHash || txSent.hash
}

// ── checkPerpLiquidity ────────────────────────────────────────────────────
// Returns 'empty' if the PerpDEX insurance fund / USDC pool has < 10 USDC,
// 'ok' otherwise.
//
// Mirrors legacy async function checkLiquidity() [perp path].

export async function checkPerpLiquidity() {
  try {
    const rp = getReadProvider()
    if (!rp) return 'empty'

    const rc  = new Contract(ADDRESSES.USDC, ['function balanceOf(address) view returns (uint256)'], rp)
    const bal = await rc.balanceOf(ADDRESSES.PERP)
    return Number(formatUnits(bal, USDC_DECIMALS)) < 10 ? 'empty' : 'ok'
  } catch (_e) {
    return 'empty'
  }
}
