/**
 * spot.js
 *
 * SpotDEX trading logic: buy, sell, and liquidity check.
 *
 * Extracted from legacy/index.html — behaviour preserved exactly.
 * No UI wiring.
 *
 * Public API
 *   spotBuy(sym, amt, setStep, slippage)   buy amt USD worth of sym
 *   spotSell(sym, amt, setStep, slippage)  sell amt tokens of sym
 *   checkSpotLiquidity(sym)                'ok' | 'empty'
 */

import { parseUnits, Contract } from 'ethers'
import { ADDRESSES, MARKET_KEYS } from './config.js'
import { ABI_SPOT } from './contracts.js'
import { getReadProvider, cSPOT } from './wallet.js'
import { pollPyth, submitPythUpdate } from './oracle.js'
import { waitTx, doApprove } from './tx.js'

// ── spotBuy ───────────────────────────────────────────────────────────────
// Mirrors legacy async function spotBuy(sym, amt, setStep).
// slippage param replaces legacy global sett.slippage (default 0.5 %).

export async function spotBuy(sym, amt, setStep, slippage) {
  var step = setStep || function () {}
  var _slip = (slippage != null ? slippage : 0.5)
  var key = MARKET_KEYS[sym]
  var raw = parseUnits(Number(amt).toFixed(6), 18) /* Always 18 dec for USDC */

  step('Approving USDC...')
  await doApprove(ADDRESSES.SPOT, raw)

  step('Updating price oracle...')
  await pollPyth().catch(function () {})

  /* Skip Pyth update if on-chain price is already fresh — saves a wallet prompt */
  var _sfresh = false
  try {
    var _srp = getReadProvider()
    if (_srp) {
      var _srC = new Contract(ADDRESSES.SPOT, ABI_SPOT, _srp)
      await _srC.quote(key, true, parseUnits('1', 18))
      _sfresh = true
    }
  } catch (_) {}
  if (!_sfresh) await submitPythUpdate()

  var min = BigInt(0)
  try {
    var q = await cSPOT().quote(key, true, raw)
    var slip = BigInt(Math.max(50, Math.min(200, Math.floor((1 - _slip / 100) * 10000))))
    min = q[0] * slip / BigInt(10000)
  } catch (er) {}

  step('Submitting buy...')
  var tx = await cSPOT().buy(key, raw, min, { gasLimit: 280000 }) /* skip estimateGas */

  step('Confirming on Base...')
  await waitTx(tx)
  return tx.hash
}

// ── spotSell ──────────────────────────────────────────────────────────────
// Mirrors legacy async function spotSell(sym, amt, setStep).
// slippage param replaces legacy global sett.slippage (default 0.5 %).

export async function spotSell(sym, amt, setStep, slippage) {
  var step = setStep || function () {}
  var _slip = (slippage != null ? slippage : 0.5)
  var key = MARKET_KEYS[sym]
  var ta = sym === 'ETH' ? ADDRESSES.ETHT : sym === 'SOL' ? ADDRESSES.SOLT : ADDRESSES.BSLV

  /* amt is token quantity entered by user directly */
  var raw = parseUnits(Number(amt).toFixed(8), 18) /* tokens in 18-decimal */

  step('Approving token...')
  await doApprove(ADDRESSES.SPOT, raw, ta)

  step('Updating price oracle...')
  await pollPyth().catch(function () {})

  var _sfresh2 = false
  try {
    var _srp2 = getReadProvider()
    if (_srp2) {
      var _srC2 = new Contract(ADDRESSES.SPOT, ABI_SPOT, _srp2)
      await _srC2.quote(key, false, parseUnits('1', 18))
      _sfresh2 = true
    }
  } catch (_) {}
  if (!_sfresh2) await submitPythUpdate()

  var min = BigInt(0)
  try {
    var q = await cSPOT().quote(key, false, raw)
    var slip = BigInt(Math.max(50, Math.min(200, Math.floor((1 - _slip / 100) * 10000))))
    min = q[0] * slip / BigInt(10000)
  } catch (er) {}

  step('Submitting sell...')
  var tx = await cSPOT().sell(key, raw, min, { gasLimit: 280000 }) /* skip estimateGas */

  step('Confirming on Base...')
  await waitTx(tx)
  return tx.hash
}

// ── checkSpotLiquidity ────────────────────────────────────────────────────
// Spot path of legacy async function checkLiquidity(sym, mode).

export async function checkSpotLiquidity(sym) {
  try {
    var key = MARKET_KEYS[sym]
    /* Use getLiquidity (more reliable than quote for liquidity checks) */
    var liq = await cSPOT().getLiquidity(key)
    if (!liq || liq[0] === BigInt(0)) return 'empty'
    return 'ok'
  } catch (er) { return 'empty' }
}
