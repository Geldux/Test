/**
 * oracle.js
 *
 * Pyth oracle integration: price polling (with CoinGecko + Binance fallbacks),
 * VAA encoding, on-chain freshness check, and price-feed update submission.
 *
 * Extracted from legacy/index.html — behaviour preserved exactly.
 * No UI wiring. No WebSocket subscriptions (those go in ws.js).
 *
 * Public API
 *   pythP             mutable price cache — read after each pollPyth() call
 *   pollPyth()        fetch latest prices from Hermes → CoinGecko → Binance
 *   getEncodedVaas()  return hex-encoded VAAs, refreshing if stale (>7 s)
 *   isPythFresh(key)  check whether the on-chain price for a key is still valid
 *   submitPythUpdate() push updatePriceFeeds tx WITHOUT awaiting confirmation
 *   pushPyth()        DEPRECATED no-op — kept for API surface compatibility
 */

import { hexlify, decodeBase64, Contract } from 'ethers'
import { HERMES, PYTH_IDS, ADDRESSES } from './config.js'
import { ABI_PERP } from './contracts.js'
import { getReadProvider, cPYTH } from './wallet.js'

// ── Module state (mirrors legacy globals) ─────────────────────────────────

// Raw base64-encoded VAA strings returned by the Hermes /v2/updates endpoint.
let _vaas   = []
// Epoch-ms timestamp of the last successful Hermes fetch.
let _vaasTs = 0

// VAA staleness threshold — matches the legacy `(Date.now()-vaasTs)>7000` guard.
const VAA_MAX_AGE_MS = 7000

// BSLV has no Pyth price feed; all three fallback paths in pollPyth() hard-set
// pythP.BSLV to this constant, matching the legacy `pythP.BSLV=0.4821` lines.
const BSLV_FALLBACK = 0.4821

// ── Mutable price cache ───────────────────────────────────────────────────
// Exported as a plain object so consumers import a stable reference and always
// read the latest values — identical to the legacy global `var pythP = {...}`.
// Do NOT replace the object (e.g. `pythP = newObj`) — mutate its properties.
export const pythP = {
  BTC:  71420,
  ETH:  3841,
  SOL:  182,
  BSLV: BSLV_FALLBACK,
}

// ── pollPyth ──────────────────────────────────────────────────────────────
// Fetches latest prices and VAAs from Pyth Hermes.
// Falls back to CoinGecko, then Binance, if Hermes is unreachable.
// Updates pythP in-place and stores raw VAAs in module state.
// Mirrors legacy async function pollPyth() exactly.

export async function pollPyth() {
  let ok = false

  // ── Primary: Pyth Hermes ─────────────────────────────────────────────
  try {
    const ids = Object.values(PYTH_IDS)
      .map((id) => 'ids[]=' + id)
      .join('&')

    const r = await fetch(
      `${HERMES}/v2/updates/price/latest?${ids}&encoding=base64`,
      { signal: AbortSignal.timeout(5000) },
    )

    if (r.ok) {
      const d = await r.json()

      _vaas   = (d.binary && d.binary.data) || []
      _vaasTs = Date.now()

      for (let i = 0; i < d.parsed.length; i++) {
        const item = d.parsed[i]
        const sym  = Object.keys(PYTH_IDS).find(
          (k) => PYTH_IDS[k] === '0x' + item.id,
        )
        if (sym) {
          pythP[sym] =
            Math.abs(Number(item.price.price)) *
            Math.pow(10, Number(item.price.expo))
        }
      }

      // BSLV has no Pyth feed — always override with the fixed fallback.
      pythP.BSLV = BSLV_FALLBACK
      ok = true
    }
  } catch (e1) {
    // swallow — try next source
  }

  // ── Fallback 1: CoinGecko ────────────────────────────────────────────
  if (!ok) {
    try {
      const cg = await fetch(
        'https://api.coingecko.com/api/v3/simple/price' +
          '?ids=bitcoin,ethereum,solana&vs_currencies=usd',
        { signal: AbortSignal.timeout(5000) },
      )

      if (cg.ok) {
        const cd = await cg.json()
        if (cd.bitcoin) pythP.BTC = cd.bitcoin.usd
        if (cd.ethereum) pythP.ETH = cd.ethereum.usd
        if (cd.solana)   pythP.SOL = cd.solana.usd
        pythP.BSLV = BSLV_FALLBACK
        ok = true
      }
    } catch (e2) {
      // swallow — try next source
    }
  }

  // ── Fallback 2: Binance ──────────────────────────────────────────────
  if (!ok) {
    try {
      const ps = await Promise.all(
        ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map((s) =>
          fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${s}`, {
            signal: AbortSignal.timeout(4000),
          })
            .then((r) => r.json())
            .catch(() => null),
        ),
      )

      if (ps[0] && ps[0].price) pythP.BTC = Number(ps[0].price)
      if (ps[1] && ps[1].price) pythP.ETH = Number(ps[1].price)
      if (ps[2] && ps[2].price) pythP.SOL = Number(ps[2].price)
      pythP.BSLV = BSLV_FALLBACK
    } catch (e3) {
      // swallow — all sources exhausted; pythP retains last known values
    }
  }
}

// ── getEncodedVaas ────────────────────────────────────────────────────────
// Returns hex-encoded VAA byte strings ready for updatePriceFeeds().
// Re-polls Hermes first if the cached VAAs are older than VAA_MAX_AGE_MS.
// Returns null if no VAAs are available after polling.
// Mirrors legacy async function getEncodedVaas().

export async function getEncodedVaas() {
  const stale = !_vaas.length || !_vaasTs || (Date.now() - _vaasTs) > VAA_MAX_AGE_MS
  if (stale) await pollPyth()
  if (!_vaas.length) return null

  return _vaas.map((v) => hexlify(decodeBase64(v)))
}

// ── isPythFresh ───────────────────────────────────────────────────────────
// Checks whether the on-chain Pyth price for the given market key is still
// valid by calling PerpDEX.getPrice() — the contract reverts if the price is
// stale, succeeds if fresh.
//
// When fresh, the caller skips submitPythUpdate() and trades in a single tx
// instead of two — reducing wallet prompts from 2 to 1.
// Mirrors legacy async function isPythFresh(assetKey).

export async function isPythFresh(assetKey) {
  try {
    const rp = getReadProvider()
    if (!rp) return false

    const c = new Contract(ADDRESSES.PERP, ABI_PERP, rp)
    // getPrice() reverts when the feed is stale; a successful call = fresh.
    await c.getPrice(assetKey)
    return true
  } catch (e) {
    return false
  }
}

// ── submitPythUpdate ──────────────────────────────────────────────────────
// Submits updatePriceFeeds() to the Pyth contract WITHOUT awaiting the tx.
// Returns the pending tx object so the caller can immediately broadcast
// the trade tx — nonce ordering guarantees updatePriceFeeds mines first.
//
// Mirrors legacy async function submitPythUpdate().

export async function submitPythUpdate() {
  const enc = await getEncodedVaas()
  if (!enc) return null

  try {
    const fee = await cPYTH().getUpdateFee(enc)
    const tx  = await cPYTH().updatePriceFeeds(enc, { value: fee, gasLimit: 400000 })
    // Intentionally NOT awaited — caller sends trade tx on the next nonce.
    return tx
  } catch (er) {
    console.warn('[oracle] Pyth submit:', er.message)
    return null
  }
}

// ── pushPyth ─────────────────────────────────────────────────────────────
// DEPRECATED — legacy comment: "use pushPythNoWait inside each trade function"
// (submitPythUpdate() is that pattern).
// Preserved as a no-op to keep the API surface intact.

export async function pushPyth() {
  /* DEPRECATED — use submitPythUpdate() inside each trade function */
}
