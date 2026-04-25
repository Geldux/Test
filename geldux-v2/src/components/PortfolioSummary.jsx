import { fmtUsdc, fmtPnl, pnlClass, calcPnlUsd } from '@/utils/format'
import { getLiveMarkForPosition } from '@/utils/priceUtils'

/* ── Portfolio Summary ──────────────────────────────────────────────
   Live unrealized PnL from open positions + mark prices.
   History-derived metrics (realized PnL, volume, deposits) stream in
   progressively as useHistory batches load.
──────────────────────────────────────────────────────────────────── */
export function PortfolioSummary({ positions, prices, summary, historyLoading }) {
  /* Unrealized PnL — live */
  let unrealizedPnl = null
  if (positions.length > 0) {
    let sum = 0
    let allPriced = true
    for (const pos of positions) {
      const mark = getLiveMarkForPosition(prices, pos)
      if (mark == null) { allPriced = false; continue }
      sum += calcPnlUsd(pos.entryPrice, mark, pos.isLong, pos.size)
    }
    if (allPriced || sum !== 0) unrealizedPnl = sum
  } else {
    unrealizedPnl = 0
  }

  /* A stat is "live" if it doesn't depend on history */
  const stats = [
    {
      label: 'Open Positions',
      value: positions.length.toString(),
      cls:   '',
      live:  true,
    },
    {
      label: 'Unrealized PnL',
      value: unrealizedPnl != null ? fmtPnl(unrealizedPnl) : '—',
      cls:   unrealizedPnl != null ? pnlClass(unrealizedPnl) : '',
      live:  true,
    },
    {
      label: 'Trades',
      value: summary ? summary.tradeCount.toString() : null,
      cls:   '',
      live:  false,
    },
    {
      label: 'Realized PnL',
      value: summary ? fmtPnl(summary.realizedPnl) : null,
      cls:   summary ? pnlClass(summary.realizedPnl) : '',
      live:  false,
    },
    {
      label: 'Total Volume',
      value: summary ? fmtUsdc(summary.totalVolume) : null,
      cls:   '',
      live:  false,
    },
    {
      label: 'Deposits',
      value: summary ? fmtUsdc(summary.totalDeposits) : null,
      cls:   '',
      live:  false,
    },
  ]

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', padding: '16px', marginBottom: 16,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16,
      }}>
        Portfolio Summary
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '14px 12px',
      }}>
        {stats.map((s) => {
          const isLoading = !s.live && historyLoading && s.value == null
          const displayValue = s.value ?? '—'
          return (
            <div key={s.label}>
              <div className="stat-label" style={{ marginBottom: 5 }}>{s.label}</div>
              {isLoading ? (
                <div className="skeleton" style={{ height: 16, width: 56, borderRadius: 4 }} />
              ) : (
                <div className={`mono ${s.cls}`} style={{ fontSize: 14, fontWeight: 700 }}>
                  {displayValue}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
