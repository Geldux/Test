import { fmtPriceRaw, fmtOI, fmtFunding } from '@/utils/format'

/* ── Desktop hero + stats strip ─────────────────────────────────────────── */
export function DesktopMarketStats({ sym, prices, oi, funding }) {
  const price = prices[sym]?.price || prices[sym]?.mark
  const long  = oi[sym]?.longOI  || 0
  const short = oi[sym]?.shortOI || 0
  const total = long + short || 1
  const longPct  = Math.round(long  / total * 100)
  const shortPct = 100 - longPct
  const fr = funding[sym] || 0

  const stats = [
    { label: 'Long OI',     value: fmtOI(long),          cls: 'pos' },
    { label: 'Short OI',    value: fmtOI(short),         cls: 'neg' },
    { label: 'Funding/hr',  value: fmtFunding(fr),       cls: fr >= 0 ? 'pos' : 'neg' },
    { label: 'Mark Long',   value: fmtPriceRaw(price),   cls: '' },
    { label: 'Mark Short',  value: fmtPriceRaw(price),   cls: '' },
  ]

  return (
    <div className="market-hero desktop-only">
      <div>
        <div className="market-hero-sym">{sym}/USD · Perpetual</div>
        <div className="market-hero-price">{fmtPriceRaw(price)}</div>
      </div>
      <div className="stats-strip">
        {stats.map((s) => (
          <div key={s.label} className="stats-strip-item">
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Desktop OI imbalance card ───────────────────────────────────────────── */
export function OICard({ sym, oi }) {
  const long  = oi[sym]?.longOI  || 0
  const short = oi[sym]?.shortOI || 0
  const total = long + short || 1
  const longPct  = Math.round(long  / total * 100)
  const shortPct = 100 - longPct

  return (
    <div className="oi-card desktop-only">
      <div className="oi-card-header">
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Open Interest</span>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
          {fmtOI(long + short)} total
        </span>
      </div>
      <div className="oi-bar">
        <div className="oi-bar-long"  style={{ width: `${longPct}%` }} />
        <div className="oi-bar-short" style={{ width: `${shortPct}%` }} />
      </div>
      <div className="oi-card-labels">
        <span className="pos" style={{ fontSize: 11, fontWeight: 600 }}>▲ Long {longPct}% · {fmtOI(long)}</span>
        <span className="neg" style={{ fontSize: 11, fontWeight: 600 }}>{fmtOI(short)} · {shortPct}% Short ▼</span>
      </div>
    </div>
  )
}

/* ── Mobile market stats ─────────────────────────────────────────────────── */
export function MobileMarketStats({ sym, prices, oi, funding }) {
  const price = prices[sym]?.price || prices[sym]?.mark
  const long  = oi[sym]?.longOI  || 0
  const short = oi[sym]?.shortOI || 0
  const fr    = funding[sym] || 0

  return (
    <div className="m-market-stats mobile-only">
      <div className="m-price-hero">{fmtPriceRaw(price)}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sym} · Perpetual</div>
      <div className="m-stats-row">
        <div className="m-stat-item">
          <div className="stat-label">Long OI</div>
          <div className="stat-value pos">{fmtOI(long)}</div>
        </div>
        <div className="m-stat-item">
          <div className="stat-label">Short OI</div>
          <div className="stat-value neg">{fmtOI(short)}</div>
        </div>
        <div className="m-stat-item">
          <div className="stat-label">Funding/hr</div>
          <div className={`stat-value ${fr >= 0 ? 'pos' : 'neg'}`}>{fmtFunding(fr)}</div>
        </div>
      </div>
    </div>
  )
}
