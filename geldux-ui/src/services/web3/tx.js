/**
 * tx.js
 *
 * Shared transaction utilities: receipt polling and ERC-20 approval.
 *
 * Extracted from legacy/index.html — behaviour preserved exactly.
 * Used by spot.js, perp.js, and data.js to avoid duplication.
 *
 * Public API
 *   waitTx(tx)                   poll for receipt; throws on revert
 *   doApprove(spender, raw, tok)  approve spender if allowance insufficient
 */

import { MaxUint256 } from 'ethers'
import { EXPLORER } from './config.js'
import { getConfirmProvider, getAccount, cUSDC, cTKN } from './wallet.js'

// ── waitTx ────────────────────────────────────────────────────────────────
// Mirrors legacy async function waitTx(tx).

export async function waitTx(tx) {
  var deadline = Date.now() + 90000, polls = 0
  var alchemy = getConfirmProvider()

  /* Poll Alchemy directly - bypasses MetaMask rate limits completely */
  if (alchemy) {
    while (Date.now() < deadline && polls < 45) {
      try {
        var receipt = await alchemy.getTransactionReceipt(tx.hash)
        if (receipt && receipt.blockNumber) {
          if (receipt.status === 0) {
            throw new Error('Transaction reverted on-chain. View on BaseScan: ' + EXPLORER + '/tx/' + tx.hash)
          }
          return receipt
        }
      } catch (pe) { console.warn('receipt poll:', pe.message) }
      await new Promise(function (r) { setTimeout(r, 2000) })
      polls++
    }
    if (Date.now() >= deadline || polls >= 45) {
      console.warn('waitTx: 90s elapsed for', tx.hash, '- tx is confirmed on-chain, check BaseScan')
      return { status: 1, transactionHash: tx.hash, hash: tx.hash, logs: [] }
    }
  }

  /* Fallback: MetaMask provider with retry on 429 */
  var attempts = 0
  while (Date.now() < deadline) {
    try {
      var _rc = await tx.wait(1)
      if (_rc && _rc.status === 0) throw new Error('Transaction reverted. View: ' + EXPLORER + '/tx/' + tx.hash)
      return _rc
    } catch (er) {
      attempts++
      var raw = er && er.message || ''
      if (
        (er.code === 'UNKNOWN_ERROR' || er.code === -32005 ||
          raw.indexOf('429') >= 0 || raw.indexOf('rate limit') >= 0) &&
        attempts <= 12
      ) {
        await new Promise(function (r) { setTimeout(r, Math.min(2000 * attempts, 8000)) })
        continue
      }
      throw er
    }
  }
  return { status: 1, transactionHash: tx.hash, hash: tx.hash, logs: [] }
}

// ── doApprove ─────────────────────────────────────────────────────────────
// Mirrors legacy async function doApprove(spender, raw, tok).

export async function doApprove(spender, raw, tok) {
  var c = tok ? cTKN(tok) : cUSDC()
  if (!c) return
  var have = await c.allowance(getAccount(), spender)
  if (have < raw) {
    var tx = await c.approve(spender, MaxUint256, { gasLimit: 80000 })
    await waitTx(tx)
  }
}
