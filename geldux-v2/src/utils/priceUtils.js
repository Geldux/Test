import { MARKETS } from '@/config/markets'

/* ── Live display price helpers ──────────────────────────────────────────────
   These helpers produce LIVE ESTIMATES for the display layer (Mark column,
   PnL, entry preview).  They are NOT the execution price path — trades always
   submit a fresh Pyth VAA fetched at submit time by getPythData({ fresh: true }).

   getMarkPrice(key, forLong) semantics:
     forLong=true  → BID  — the price long positions are marked/valued at
                             (close-side for longs; open-side for shorts)
     forLong=false → ASK  — the price short positions are marked/valued at
                             (close-side for shorts; open-side for longs)

   Consequently in _prices[sym]:
     markLong  = getMarkPrice(key, true)  = BID  (lower price)
     markShort = getMarkPrice(key, false) = ASK  (higher price)

   Source priority for both helpers:
     1. Direction-correct contract mark (PERP_CONFIG.getMarkPrice) when available.
     2. Live Hermes/Pyth mid price as a real-time estimate when the contract mark
        is stale (no active price updater on testnet between trades).

   Separation from execution path:
     Execution price  → fresh Pyth VAA submitted on-chain (useTrading.getPythData)
     Realized PnL     → receipt event parsing (parseCloseReceipt)
     Display estimate → these helpers (live contract mark or Hermes estimate)
   ─────────────────────────────────────────────────────────────────────────── */

/* Close-side live mark for position Mark/PnL display.
   Long  → markLong  (BID, contract close-side for longs)  if available, else Hermes mid.
   Short → markShort (ASK, contract close-side for shorts) if available, else Hermes mid.
   Returns null only when no price data is available at all. */
export function getLiveMarkForPosition(prices, pos) {
  const sym = MARKETS.find((m) => m.key === pos.assetKey)?.sym
  const p   = prices?.[sym]
  if (!p) return null

  /* Long closes at BID (markLong); short closes at ASK (markShort). */
  const contractMark = pos.isLong ? p.markLong : p.markShort
  if ((contractMark || 0) > 0) return contractMark

  /* Contract mark unavailable (stale on-chain Pyth between trades on testnet).
     Fall back to live Hermes mid as a display estimate. */
  return (p.price || 0) > 0 ? p.price : null
}

/* Open-side live mark for entry price preview in TradingPanel.
   Long  → markShort (ASK, unfavorable open price for longs)  if available, else Hermes mid.
   Short → markLong  (BID, unfavorable open price for shorts) if available, else Hermes mid.
   Returns null only when no price data is available at all. */
export function getLiveOpenPreviewMark(prices, sym, isLong) {
  const p = prices?.[sym]
  if (!p) return null

  /* Long opens at ASK (markShort); short opens at BID (markLong). */
  const contractMark = isLong ? p.markShort : p.markLong
  if ((contractMark || 0) > 0) return contractMark

  return (p.price || 0) > 0 ? p.price : null
}
