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

import { parseUnits, formatUnits, Interface } from 'ethers'
import { ADDRESSES, MARKET_KEYS, USDC_DECIMALS } from './config.js'
import { ABI_PERP } from './contracts.js'
import { cPERP, cUSDC } from './wallet.js'
import { pollPyth, getEncodedVaas, isPythFresh, submitPythUpdate } from './oracle.js'
import { waitTx, doApprove } from './tx.js'

// ── perpOpen ──────────────────────────────────────────────────────────────
// Mirrors legacy async function perpOpen(sym, isLong, lev, colUSD, setStep).

export async function perpOpen(sym, isLong, lev, colUSD, setStep) {
  var step = setStep || function () {}
  var key = MARKET_KEYS[sym]
  var raw = parseUnits(String(Number(colUSD).toFixed(6)), USDC_DECIMALS)

  /* Pre-check: is this market active on-chain? Saves user a failed tx + gas */
  step('Checking market...')
  try {
    var isActive = await cPERP().assetActive(key)
    if (!isActive) throw new Error('Market inactive: ' + sym + ' perp is not enabled on-chain. Contact admin to run addAsset().')
  } catch (ce) {
    if (ce.message && ce.message.indexOf('Market inactive') >= 0) throw ce
    /* If read fails (RPC issue), continue anyway */
    console.warn('assetActive check failed:', ce.message)
  }

  step('Approving USDC...')
  await doApprove(ADDRESSES.PERP, raw)

  step('Checking price...')
  var enc = await getEncodedVaas()
  if (!enc) throw new Error('Cannot fetch Pyth price. Check internet and retry.')

  /* Check if price is already fresh on-chain — skip Pyth tx if so (1 prompt instead of 2) */
  var _fresh = await isPythFresh(key)
  if (!_fresh) {
    step('Updating price (1/2)...')
    await submitPythUpdate() /* nonce N — waits for nonce ordering */
    step('Submitting trade (2/2)...')
  } else {
    step('Submitting trade...')
  }

  var tx = await cPERP().open(key, isLong, lev, raw, { gasLimit: _fresh ? 300000 : 350000 })
  step('Confirming on Base...')
  var rc = await waitTx(tx)
  var logs = (rc && rc.logs) || []
  var iface = new Interface(ABI_PERP)
  for (var i = 0; i < logs.length; i++) {
    try {
      var p = iface.parseLog(logs[i])
      if (p && p.name === 'Opened') return { hash: tx.hash, posId: Number(p.args[0]) }
    } catch (er) {}
  }
  return { hash: tx.hash, posId: null }
}

// ── perpClose ─────────────────────────────────────────────────────────────
// Mirrors legacy async function perpClose(posId).

export async function perpClose(posId) {
  await pollPyth().catch(function () {})

  /* Only push Pyth update if price is stale — otherwise close is 1 tx */
  /* We need to find the posId's assetKey to check freshness */
  var _keyForClose = null
  try {
    var _gp = await cPERP().getPosition(posId)
    if (_gp && _gp[1]) _keyForClose = _gp[1]
  } catch (_) {}
  var _closeFresh = _keyForClose ? await isPythFresh(_keyForClose) : false
  if (!_closeFresh) {
    await submitPythUpdate() /* nonce N — submit without waiting */
  }

  var lastErr, txSent = null
  for (var att = 0; att < 3; att++) {
    try {
      var tx = await cPERP().close(posId, { gasLimit: 300000 }) /* skip estimateGas - pyth pending */
      txSent = tx.hash
      await waitTx(tx)
      return tx.hash
    } catch (er) {
      lastErr = er
      var raw = er && er.message || ''
      var retry = raw.indexOf('429') >= 0 || raw.indexOf('rate limit') >= 0 || raw.indexOf('coalesce') >= 0 || raw.indexOf('UNKNOWN_ERROR') >= 0
      if (retry && att < 2) { await new Promise(function (r) { setTimeout(r, 4000 + att * 2000) }); continue }
      if (txSent) return txSent
      /* estimateGas failure = contract issue, not RPC */
      var raw2 = er && er.message || ''
      if (raw2.indexOf('missing revert data') >= 0 || raw2.indexOf('estimateGas') >= 0) {
        throw new Error('Close rejected by contract. Position may already be closed or contract has insufficient funds. Check Portfolio.')
      }
      throw er
    }
  }
  if (txSent) return txSent
  throw lastErr || new Error('Close failed')
}

// ── checkPerpLiquidity ────────────────────────────────────────────────────
// Perp path of legacy async function checkLiquidity(sym, mode).

export async function checkPerpLiquidity() {
  try {
    var perpBal = await cUSDC().balanceOf(ADDRESSES.PERP)
    var perpUSD = Number(formatUnits(perpBal, USDC_DECIMALS))
    if (perpUSD < 10) return 'empty'
    return 'ok'
  } catch (er) { return 'empty' }
}
