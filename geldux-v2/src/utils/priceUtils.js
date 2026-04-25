import { MARKETS } from '@/config/markets'

/* ── Live display price helpers ──────────────────────────────────────────────
   These helpers produce LIVE ESTIMATES for the display layer (Mark column,
   PnL, entry preview).  They are NOT the execution price path — trades always
   submit a fresh Pyth VAA fetched at submit time by getPythData({ fresh: true }).

   Source priority for both helpers:
     1. Direction-correct contract mark (PERP_CONFIG.getMarkPrice) when available.
        Reflects any bid/ask spread the protocol applies.
     2. Live Hermes/Pyth mid price as a real-time estimate when the contract mark
        is stale (no active price updater on testnet between trades).
        This is labelled clearly as a live estimate throughout the codebase.

   Separation from execution path:
     Execution price  → fresh Pyth VAA submitted on-chain (useTrading.getPythData)
     Realized PnL     → receipt event parsing (parseCloseReceipt)
     Display estimate → these helpers (live contract mark or Hermes estimate)
   ─────────────────────────────────────────────────────────────────────────── */

/* Close-side live mark for position Mark/PnL display.
   Long  → markShort (contract bid) if available, else live Hermes mid estimate.
   Short → markLong  (contract ask) if available, else live Hermes mid estimate.
   Returns null only when no price data is available at all. */
export function getLiveMarkForPosition(prices, pos) {
  const sym = MARKETS.find((m) => m.key === pos.assetKey)?.sym
  const p   = prices?.[sym]
  if (!p) return null

  const contractMark = pos.isLong ? p.markShort : p.markLong
  if ((contractMark || 0) > 0) return contractMark

  /* Contract mark unavailable (stale on-chain Pyth between trades on testnet).
     Fall back to live Hermes mid as a display estimate. */
  return (p.price || 0) > 0 ? p.price : null
}

/* Open-side live mark for entry price preview in TradingPanel.
   Long  → markLong  (contract ask) if available, else live Hermes mid estimate.
   Short → markShort (contract bid) if available, else live Hermes mid estimate.
   Returns null only when no price data is available at all. */
export function getLiveOpenPreviewMark(prices, sym, isLong) {
  const p = prices?.[sym]
  if (!p) return null

  const contractMark = isLong ? p.markLong : p.markShort
  if ((contractMark || 0) > 0) return contractMark

  return (p.price || 0) > 0 ? p.price : null
}
