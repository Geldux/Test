/**
 * tx.js
 *
 * Shared transaction utilities: receipt polling and ERC-20 approval.
 *
 * Both spot.js and perp.js (and data.js) depend on these helpers.
 * Extracted here to avoid duplication across trading modules.
 *
 * Public API
 *   waitTx(tx)                  poll for receipt via Alchemy, fallback to tx.wait(1)
 *   doApprove(spender, raw, tok) approve spender if allowance is insufficient
 */

import { MaxUint256 } from 'ethers'
import { getConfirmProvider, getAccount, cUSDC, cTKN } from './wallet.js'

// ── waitTx ────────────────────────────────────────────────────────────────
// Waits for a transaction receipt with a 90-second overall deadline.
//
// Primary path: polls Alchemy every 2 s (up to 45 polls = 90 s).
// Fallback path: tx.wait(1) with exponential-backoff retry on 429 /
// UNKNOWN_ERROR (up to 12 attempts, delay = min(2000 * attempt, 8000) ms).
//
// On timeout, returns a synthetic { status: 1, ... } object so the caller
// can continue without throwing — mirrors legacy behaviour.
//
// Mirrors legacy async function waitTx(tx).

export async function waitTx(tx) {
  const cp = getConfirmProvider()

  // ── Primary: Alchemy polling ─────────────────────────────────────────
  if (cp) {
    const POLL_INTERVAL_MS = 2000
    const MAX_POLLS        = 45   // 45 × 2 s = 90 s

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      try {
        const receipt = await cp.getTransactionReceipt(tx.hash)
        if (receipt) return receipt
      } catch (_e) {
        // swallow transient RPC errors and keep polling
      }
    }

    // 90 s elapsed — return synthetic receipt so callers can proceed.
    return { status: 1, hash: tx.hash, synthetic: true }
  }

  // ── Fallback: tx.wait(1) with retry ──────────────────────────────────
  const MAX_RETRIES = 12
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await tx.wait(1)
    } catch (er) {
      const msg  = (er.message || '').toLowerCase()
      const code = er.code || ''
      const retryable =
        msg.includes('429') ||
        msg.includes('rate limit') ||
        code === 'UNKNOWN_ERROR'

      if (!retryable || attempt === MAX_RETRIES) throw er

      const delay = Math.min(2000 * attempt, 8000)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}

// ── doApprove ─────────────────────────────────────────────────────────────
// Approves `spender` to spend `raw` units of a token on behalf of the
// connected account.
//
// If `tok` is provided, uses cTKN(tok); otherwise uses cUSDC().
// Skips the approval tx if the existing allowance is already >= raw.
// Uses MaxUint256 to avoid repeated approvals (mirrors legacy behaviour).
//
// Mirrors legacy async function doApprove(spender, raw, tok).

export async function doApprove(spender, raw, tok) {
  const contract = tok ? cTKN(tok) : cUSDC()
  if (!contract) throw new Error('[tx] doApprove: contract not ready')

  const account   = getAccount()
  const allowance = await contract.allowance(account, spender)

  if (allowance >= raw) return   // already approved

  const tx = await contract.approve(spender, MaxUint256, { gasLimit: 80000 })
  await waitTx(tx)
}
