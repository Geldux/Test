import { MARKETS } from '@/config/markets'
import { fmtPriceRaw, fmtOI, fmtFunding } from '@/utils/format'

/* ── Desktop sidebar market list ───────────────────────────────── */
export function DesktopMarketBar({ prices, oi, funding, selected, onSelect }) {
  return (
    <aside className="d-sidebar desktop-only">
      <div className="d-sidebar-title">Markets</div>
      {MARKETS.map((m) => {
        const p     = prices[m.sym]?.price || prices[m.sym]?.mark
        const long  = oi[m.sym]?.longOI  ?? null
        const short = oi[m.sym]?.shortOI ?? null
        const hasOI = long != null && short != null
        const total = hasOI ? (long + short || 1) : 1
        const lPct  = hasOI ? Math.round(long  / total * 100) : 50
        const sPct  = hasOI ? 100 - lPct : 50
        const fr    = funding[m.sym] ?? null

        return (
          <div
            key={m.sym}
            className={`market-item ${selected === m.sym ? 'active' : ''}`}
            onClick={() => onSelect(m.sym)}
          >
            <div className="market-item-row1">
              <span className="market-sym">{m.sym}</span>
              <span className="market-price mono">{fmtPriceRaw(p)}</span>
            </div>
            <div className="market-item-row2">
              <span className={`market-funding ${fr == null ? '' : fr >= 0 ? 'pos' : 'neg'}`}>{fmtFunding(fr)}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{hasOI ? fmtOI(long + short) : '—'}</span>
            </div>
            <div className="market-oi-bar-wrap">
              <div className="market-oi-label">
                <span className="pos" style={{ fontSize: 10 }}>L {lPct}%</span>
                <span className="neg" style={{ fontSize: 10 }}>S {sPct}%</span>
              </div>
              <div className="oi-bar">
                <div className="oi-bar-long"  style={{ width: `${lPct}%` }} />
                <div className="oi-bar-short" style={{ width: `${sPct}%` }} />
              </div>
            </div>
          </div>
        )
      })}

      {/* Intelligence placeholder cards */}
      <div style={{ marginTop: 'auto', padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          Signals
        </div>
        {[
          { label: 'Trending',   value: 'BTC',  icon: '↑' },
          { label: 'High OI',    value: 'ETH',  icon: '◉' },
          { label: 'Rate Alert', value: 'SOL+', icon: '⚡' },
        ].map((s) => (
          <div key={s.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '4px 0', fontSize: 12, color: 'var(--text-3)',
          }}>
            <span>{s.label}</span>
            <span style={{ fontWeight: 700, color: 'var(--text-2)' }}>{s.icon} {s.value}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}

/* ── Mobile horizontal chip strip ──────────────────────────────── */
export function MobileMarketChips({ prices, selected, onSelect }) {
  return (
    <div className="m-market-chips mobile-only">
      {MARKETS.map((m) => {
        const p = prices[m.sym]?.price || prices[m.sym]?.mark
        return (
          <button
            key={m.sym}
            className={`m-chip ${selected === m.sym ? 'active' : ''}`}
            onClick={() => onSelect(m.sym)}
          >
            {m.sym}
            <span className="m-chip-sub">{fmtPriceRaw(p)}</span>
          </button>
        )
      })}
    </div>
  )
}
