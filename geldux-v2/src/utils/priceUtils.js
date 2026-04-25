import { MARKETS } from '@/config/markets'

/* Throttle tracker: suppress repeat warnings per (sym, side) */
const _warnTs = {}

/* Direction-correct close-side mark for PnL and position display.
   Long  closes at bid  → markShort  PERP_CONFIG.getMarkPrice(key, false)
   Short closes at ask  → markLong   PERP_CONFIG.getMarkPrice(key, true)
   Never falls back to Hermes mid (prices[sym].price).
   Returns null when direction-correct contract mark is unavailable;
   callers must display '—' rather than misleading profit. */
export function getCloseMarkForPosition(prices, pos) {
  const sym  = MARKETS.find((m) => m.key === pos.assetKey)?.sym
  const p    = prices?.[sym]
  if (!p) return null

  const raw  = pos.isLong ? p.markShort : p.markLong
  const mark = raw > 0 ? raw : null

  if (mark == null && (p.price || 0) > 0) {
    const wk  = `${sym}-${pos.isLong ? 1 : 0}`
    const now = Date.now()
    if (!_warnTs[wk] || now - _warnTs[wk] > 30_000) {
      _warnTs[wk] = now
      const entry    = Number(pos.entryPrice) || 0
      const size     = Number(pos.size)       || 0
      const pnlWould = entry > 0 && size > 0
        ? ((pos.isLong ? (p.price - entry) / entry : (entry - p.price) / entry) * size).toFixed(4)
        : '—'
      console.warn(
        `[priceUtils] ${sym} ${pos.isLong ? 'long' : 'short'}` +
        ` | entry=${entry} markLong=${p.markLong || 0} markShort=${p.markShort || 0} Hermes=${p.price}` +
        ` | contract mark unavailable — Hermes mid BLOCKED from PnL fallback — PnL shows '—'` +
        ` (would have been ${pnlWould} if Hermes mid were used)`
      )
    }
  }

  return mark
}

/* Direction-correct open-side mark for entry price preview in TradingPanel.
   Long  opens at ask → markLong   PERP_CONFIG.getMarkPrice(key, true)
   Short opens at bid → markShort  PERP_CONFIG.getMarkPrice(key, false)
   Returns null when direction-correct contract mark is unavailable. */
export function getOpenMarkForSide(prices, sym, isLong) {
  const p   = prices?.[sym]
  if (!p) return null
  const raw = isLong ? p.markLong : p.markShort
  return raw > 0 ? raw : null
}
