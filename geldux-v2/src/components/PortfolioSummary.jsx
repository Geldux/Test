import { MARKETS } from '@/config/markets'
import { fmtUsdc, fmtPnl, pnlClass, calcPnlUsd } from '@/utils/format'

/* ── Portfolio Summary ──────────────────────────────────────────────
   Shows live unrealized PnL (from open positions + mark prices) and
   history-derived metrics (realized PnL, volume, deposits).
   All derived values show '—' until data is available.
──────────────────────────────────────────────────────────────────── */
export function PortfolioSummary({ positions, prices, summary, historyLoading }) {
  /* Unrealized PnL — live from positions + mark prices */
  let unrealizedPnl = null
  if (positions.length > 0) {
    let sum = 0
    let allPriced = true
    for (const pos of positions) {
      const sym  = MARKETS.find((m) => m.key === pos.assetKey)?.sym
      const mark = sym ? (prices[sym]?.price || prices[sym]?.mark) : null
      if (!mark) { allPriced = false; continue }
      sum += calcPnlUsd(pos.entryPrice, mark, pos.isLong, pos.size)
    }
    if (allPriced || sum !== 0) unrealizedPnl = sum
  } else {
    unrealizedPnl = 0
  }

  const stats = [
    {
      label: 'Open Positions',
      value: positions.length.toString(),
      cls:   '',
    },
    {
      label: 'Unrealized PnL',
      value: unrealizedPnl != null ? fmtPnl(unrealizedPnl) : '—',
      cls:   unrealizedPnl != null ? pnlClass(unrealizedPnl) : '',
    },
    {
      label: 'Realized PnL',
      value: summary ? fmtPnl(summary.realizedPnl) : '—',
      cls:   summary ? pnlClass(summary.realizedPnl) : '',
    },
    {
      label: 'Total Volume',
      value: summary ? fmtUsdc(summary.totalVolume) : '—',
      cls:   '',
    },
    {
      label: 'Deposits',
      value: summary ? fmtUsdc(summary.totalDeposits) : '—',
      cls:   '',
    },
    {
      label: 'Withdrawals',
      value: summary ? fmtUsdc(summary.totalWithdrawals) : '—',
      cls:   '',
    },
  ]

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', padding: '16px', marginBottom: 16,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14,
      }}>
        Portfolio Summary
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
      }}>
        {stats.map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{s.label}</div>
            <div className={`mono ${s.cls}`} style={{ fontSize: 14, fontWeight: 700 }}>
              {historyLoading && !summary && s.label !== 'Open Positions' && s.label !== 'Unrealized PnL'
                ? <span style={{ color: 'var(--text-4)' }}>…</span>
                : s.value
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
