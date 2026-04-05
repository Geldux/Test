import { MARKETS } from '@/config/markets'
import { fmtPriceRaw, fmtOI, fmtFunding } from '@/utils/format'

/* ── Desktop sidebar ────────────────────────────────────────────────────── */
export function DesktopMarketBar({ prices, oi, funding, selected, onSelect }) {
  return (
    <aside className="d-sidebar desktop-only">
      <div className="d-sidebar-title">Markets</div>
      {MARKETS.map((m) => {
        const price = prices[m.sym]?.price || prices[m.sym]?.mark
        const long  = oi[m.sym]?.longOI  || 0
        const short = oi[m.sym]?.shortOI || 0
        const total = long + short || 1
        const longPct  = Math.round(long  / total * 100)
        const shortPct = 100 - longPct
        const fr = funding[m.sym] || 0

        return (
          <div
            key={m.sym}
            className={`market-item ${selected === m.sym ? 'active' : ''}`}
            onClick={() => onSelect(m.sym)}
          >
            <div className="market-item-row1">
              <span className="market-sym">{m.sym}</span>
              <span className="market-price">{fmtPriceRaw(price)}</span>
            </div>
            <div className="market-item-row2">
              <span className={`market-funding ${fr >= 0 ? 'pos' : 'neg'}`}>{fmtFunding(fr)}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {fmtOI(long + short)}
              </span>
            </div>
            <div className="market-oi-bar-wrap">
              <div className="market-oi-label">
                <span className="pos" style={{ fontSize: 10 }}>L {longPct}%</span>
                <span className="neg" style={{ fontSize: 10 }}>S {shortPct}%</span>
              </div>
              <div className="oi-bar">
                <div className="oi-bar-long"  style={{ width: `${longPct}%` }} />
                <div className="oi-bar-short" style={{ width: `${shortPct}%` }} />
              </div>
            </div>
          </div>
        )
      })}
    </aside>
  )
}

/* ── Mobile chips ────────────────────────────────────────────────────────── */
export function MobileMarketChips({ prices, selected, onSelect }) {
  return (
    <div className="m-market-chips mobile-only">
      {MARKETS.map((m) => {
        const price = prices[m.sym]?.price || prices[m.sym]?.mark
        return (
          <button
            key={m.sym}
            className={`m-chip ${selected === m.sym ? 'active' : ''}`}
            onClick={() => onSelect(m.sym)}
          >
            {m.sym}
            <span className="m-chip-sub"> {fmtPriceRaw(price)}</span>
          </button>
        )
      })}
    </div>
  )
}
