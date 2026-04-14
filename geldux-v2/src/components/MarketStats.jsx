import { fmtPriceRaw, fmtOI, fmtFunding } from '@/utils/format'

/* ── Desktop price hero + stats strip ──────────────────────────── */
export function DesktopMarketStats({ sym, prices, oi, funding }) {
  const p     = prices[sym]?.price || prices[sym]?.mark
  const long  = oi[sym]?.longOI  ?? null
  const short = oi[sym]?.shortOI ?? null
  const hasOI = long != null && short != null
  const total = hasOI ? (long + short || 1) : 1
  const lPct  = hasOI ? Math.round(long / total * 100) : 50
  const fr    = funding[sym] ?? null

  const stats = [
    { label: 'Long OI',    value: hasOI ? fmtOI(long)  : '—',  cls: 'pos' },
    { label: 'Short OI',   value: hasOI ? fmtOI(short) : '—',  cls: 'neg' },
    { label: 'Funding/hr', value: fmtFunding(fr),               cls: fr == null ? '' : fr >= 0 ? 'pos' : 'neg' },
    { label: 'Mark Price', value: fmtPriceRaw(p),               cls: '' },
    { label: 'L/S Ratio',  value: hasOI ? `${lPct}% / ${100 - lPct}%` : '—', cls: '' },
  ]

  return (
    <div className="market-hero desktop-only">
      <div style={{ flexShrink: 0 }}>
        <div className="market-hero-sym">{sym} / USDC · Perp</div>
        <div className="market-hero-price mono">{fmtPriceRaw(p)}</div>
      </div>
      <div className="stats-strip">
        {stats.map((s) => (
          <div key={s.label} className="stats-strip-item">
            <div className="stat-label">{s.label}</div>
            <div className={`stat-val mono ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Desktop OI imbalance card ──────────────────────────────────── */
export function OICard({ sym, oi }) {
  const long  = oi[sym]?.longOI  ?? null
  const short = oi[sym]?.shortOI ?? null
  const hasOI = long != null && short != null
  const total = hasOI ? (long + short || 1) : 1
  const lPct  = hasOI ? Math.round(long / total * 100) : 50
  const sPct  = hasOI ? 100 - lPct : 50

  return (
    <div className="oi-card card desktop-only" style={{ marginTop: 12 }}>
      <div className="oi-card-header">
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Open Interest
        </span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {hasOI ? fmtOI(long + short) : '—'}
        </span>
      </div>
      <div className="oi-bar" style={{ height: 5 }}>
        <div className="oi-bar-long"  style={{ width: `${lPct}%` }} />
        <div className="oi-bar-short" style={{ width: `${sPct}%` }} />
      </div>
      <div className="oi-card-labels">
        <span className="pos" style={{ fontSize: 11, fontWeight: 700 }}>
          {hasOI ? `▲ Long ${lPct}% · ${fmtOI(long)}` : '▲ Long —'}
        </span>
        <span className="neg" style={{ fontSize: 11, fontWeight: 700 }}>
          {hasOI ? `${fmtOI(short)} · ${sPct}% ▼` : '— ▼'}
        </span>
      </div>
    </div>
  )
}

/* ── Mobile market stats ────────────────────────────────────────── */
export function MobileMarketStats({ sym, prices, oi, funding }) {
  const p     = prices[sym]?.price || prices[sym]?.mark
  const long  = oi[sym]?.longOI  ?? null
  const short = oi[sym]?.shortOI ?? null
  const hasOI = long != null && short != null
  const fr    = funding[sym] ?? null

  return (
    <div className="m-market-stats mobile-only">
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 3 }}>
        {sym}/USDC · Perpetual
      </div>
      <div className="m-price-hero mono">{fmtPriceRaw(p)}</div>
      <div className="m-stats-row">
        {[
          { label: 'Long OI',    value: hasOI ? fmtOI(long)  : '—', cls: 'pos' },
          { label: 'Short OI',   value: hasOI ? fmtOI(short) : '—', cls: 'neg' },
          { label: 'Funding/hr', value: fmtFunding(fr), cls: fr == null ? '' : fr >= 0 ? 'pos' : 'neg' },
        ].map((s) => (
          <div key={s.label} className="m-stat-item">
            <div className="stat-label">{s.label}</div>
            <div className={`stat-val mono ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
