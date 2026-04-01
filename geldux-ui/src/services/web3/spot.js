/**
 * spot.js
 *
 * SpotDEX trading logic: buy, sell, and liquidity check.
 *
 * Extracted from legacy/index.html — behaviour preserved exactly.
 * No UI wiring.
 *
 * Public API
 *   spotBuy(sym, amt, setStep, slippage)   buy `amt` USD worth of `sym`
 *   spotSell(sym, amt, setStep, slippage)  sell `amt` tokens of `sym`
 *   checkSpotLiquidity(sym)                'ok' | 'empty'
 */

import { parseUnits, formatUnits, Contract } from 'ethers'
import { ADDRESSES, MARKET_KEYS, USDC_DECIMALS } from './config.js'
import { ABI_SPOT } from './contracts.js'
import { getReadProvider, cSPOT, cTKN } from './wallet.js'
import { submitPythUpdate } from './oracle.js'
import { waitTx, doApprove } from './tx.js'

// Token addresses indexed by spot-sell symbol.
const TOKEN_ADDRESS = {
  ETH:  ADDRESSES.ETHT,
  SOL:  ADDRESSES.SOLT,
  BSLV: ADDRESSES.BSLV,
}

// ── spotBuy ───────────────────────────────────────────────────────────────
// Buys `amt` USD worth of `sym` on SpotDEX.
//
// Steps (mirrors legacy spotBuy):
//   1  parseUnits — truncate to 6 dp, encode as 18-decimal raw value
//   2  doApprove  — approve SPOT for raw USDC spend
//   3  Freshness  — SpotDEX.quote() via read provider; any revert = stale
//   4  Pyth push  — submitPythUpdate() if price is stale (unawaited)
//   5  buy()      — gasLimit 280 000, minOut computed from slippage
//   6  waitTx     — poll receipt via Alchemy
//
// `setStep` is a UI callback (step number string); callers may pass a no-op.
// `slippage` is a percentage (default 0.5 %).
//
// Mirrors legacy async function spotBuy(sym, amt, slippage).

export async function spotBuy(sym, amt, setStep = () => {}, slippage = 0.5) {
  const key = MARKET_KEYS[sym]
  if (!key) throw new Error(`[spot] Unknown symbol: ${sym}`)

  setStep('1')

  // Truncate to 6 decimal places to avoid precision errors, then encode as 18-dec.
  const raw = parseUnits(Number(amt).toFixed(6), USDC_DECIMALS)

  setStep('2')
  await doApprove(ADDRESSES.SPOT, raw)

  setStep('3')

  // Freshness check — quote() reverts when Pyth price is stale.
  let fresh = false
  try {
    const rp = getReadProvider()
    if (rp) {
      const rc = new Contract(ADDRESSES.SPOT, ABI_SPOT, rp)
      await rc.quote(key, true, raw)
      fresh = true
    }
  } catch (_e) {
    fresh = false
  }

  if (!fresh) {
    setStep('4')
    await submitPythUpdate()  // intentionally not awaited further — nonce ordering
  }

  setStep('5')

  // min-out: clamp slippage factor to [50, 200] bps range, then scale by 10 000.
  const bpsFactor = BigInt(
    Math.max(50, Math.min(200, Math.floor((1 - slippage / 100) * 10000))),
  )
  // quote() to get expected out, then apply bps
  let minOut = 0n
  try {
    const rp = getReadProvider()
    if (rp) {
      const rc  = new Contract(ADDRESSES.SPOT, ABI_SPOT, rp)
      const [out] = await rc.quote(key, true, raw)
      minOut = (out * bpsFactor) / 10000n
    }
  } catch (_e) {
    minOut = 0n
  }

  const tx      = await cSPOT().buy(key, raw, minOut, { gasLimit: 280000 })
  setStep('6')
  const receipt = await waitTx(tx)
  return receipt
}

// ── spotSell ──────────────────────────────────────────────────────────────
// Sells `amt` tokens of `sym` on SpotDEX.
//
// Steps (mirrors legacy spotSell):
//   1  token address lookup (ETH→ETHT, SOL→SOLT, else BSLV)
//   2  parseUnits — truncate to 8 dp, encode as 18-decimal raw value
//   3  doApprove  — approve SPOT for token spend
//   4  Freshness  — SpotDEX.quote() via read provider
//   5  Pyth push  — submitPythUpdate() if stale
//   6  sell()     — gasLimit 280 000, minOut from slippage
//   7  waitTx     — poll receipt
//
// Mirrors legacy async function spotSell(sym, amt, slippage).

export async function spotSell(sym, amt, setStep = () => {}, slippage = 0.5) {
  const key     = MARKET_KEYS[sym]
  const tokAddr = TOKEN_ADDRESS[sym]
  if (!key)     throw new Error(`[spot] Unknown symbol: ${sym}`)
  if (!tokAddr) throw new Error(`[spot] No token address for: ${sym}`)

  setStep('1')

  // Truncate to 8 decimal places for token amounts.
  const raw = parseUnits(Number(amt).toFixed(8), 18)

  setStep('2')
  await doApprove(ADDRESSES.SPOT, raw, tokAddr)

  setStep('3')

  let fresh = false
  try {
    const rp = getReadProvider()
    if (rp) {
      const rc = new Contract(ADDRESSES.SPOT, ABI_SPOT, rp)
      await rc.quote(key, false, raw)
      fresh = true
    }
  } catch (_e) {
    fresh = false
  }

  if (!fresh) {
    setStep('4')
    await submitPythUpdate()
  }

  setStep('5')

  const bpsFactor = BigInt(
    Math.max(50, Math.min(200, Math.floor((1 - slippage / 100) * 10000))),
  )
  let minOut = 0n
  try {
    const rp = getReadProvider()
    if (rp) {
      const rc    = new Contract(ADDRESSES.SPOT, ABI_SPOT, rp)
      const [out] = await rc.quote(key, false, raw)
      minOut      = (out * bpsFactor) / 10000n
    }
  } catch (_e) {
    minOut = 0n
  }

  const tx      = await cSPOT().sell(key, raw, minOut, { gasLimit: 280000 })
  setStep('6')
  const receipt = await waitTx(tx)
  return receipt
}

// ── checkSpotLiquidity ────────────────────────────────────────────────────
// Returns 'empty' if the SpotDEX pool for `sym` has no base-token liquidity,
// 'ok' otherwise.
//
// Uses the read provider so no wallet connection is needed.
// Mirrors legacy async function checkLiquidity(sym) [spot path].

export async function checkSpotLiquidity(sym) {
  const key = MARKET_KEYS[sym]
  if (!key) return 'empty'

  try {
    const rp = getReadProvider()
    if (!rp) return 'empty'

    const rc  = new Contract(ADDRESSES.SPOT, ABI_SPOT, rp)
    const liq = await rc.getLiquidity(key)
    return liq[0] === 0n ? 'empty' : 'ok'
  } catch (_e) {
    return 'empty'
  }
}
