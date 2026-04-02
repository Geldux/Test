import { useMemo } from 'react'
import { DollarSign, TrendingUp, BarChart2, Percent } from 'lucide-react'
import { StatCard, Card, CardHeader, CardTitle, Badge, Table, TableHead, TableBody, TableRow, TableCell } from '@/components/ui'
import { useWallet } from '@/contexts/WalletContext'
import { useAppData } from '@/contexts/DataContext'
import styles from './Portfolio.module.css'

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fmtUsd(n, dec = 2) {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

const TOKEN_NAMES = { USDC: 'Tether USDC', ETH_TKN: 'Ethereum', SOL_TKN: 'Solana', BSLV: 'BaseLove' }
const TOKEN_SYMS  = { USDC: 'USDC',        ETH_TKN: 'ETH',      SOL_TKN: 'SOL',    BSLV: 'BSLV'  }

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function Portfolio() {
  const { account }                          = useWallet()
  const { balances, positions, prices, pts } = useAppData()

  /* Spot holdings derived from real balances */
  const holdings = useMemo(() => {
    if (!balances) return []
    const rows = [
      { key: 'USDC',    qty: balances.USDC    || 0, unitPrice: 1              },
      { key: 'ETH_TKN', qty: balances.ETH_TKN || 0, unitPrice: prices.ETH  || 0 },
      { key: 'SOL_TKN', qty: balances.SOL_TKN || 0, unitPrice: prices.SOL  || 0 },
      { key: 'BSLV',    qty: balances.BSLV    || 0, unitPrice: prices.BSLV || 0 },
    ]
    const total = rows.reduce((s, r) => s + r.qty * r.unitPrice, 0)
    return rows
      .filter((r) => r.qty > 0 || r.key === 'USDC')
      .map((r) => ({
        asset:      TOKEN_SYMS[r.key],
        name:       TOKEN_NAMES[r.key],
        amount:     r.key === 'USDC'
          ? r.qty.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' USDC'
          : r.qty.toFixed(4) + ' ' + TOKEN_SYMS[r.key],
        value:      fmtUsd(r.qty * r.unitPrice),
        allocation: total > 0 ? Math.round((r.qty * r.unitPrice / total) * 1000) / 10 : 0,
        pnl:        '—',
        pnlPct:     0,
      }))
  }, [balances, prices])

  /* Total spot portfolio value */
  const totalValue = useMemo(() => {
    if (!balances) return null
    return (
      (balances.USDC    || 0) * 1 +
      (balances.ETH_TKN || 0) * (prices.ETH  || 0) +
      (balances.SOL_TKN || 0) * (prices.SOL  || 0) +
      (balances.BSLV    || 0) * (prices.BSLV || 0)
    )
  }, [balances, prices])

  /* Unrealized PnL from open perp positions */
  const openPnl = useMemo(() => {
    if (!positions.length) return 0
    return positions.reduce((acc, pos) => {
      const mark = prices[pos.sym] || pos.entry
      const pct  = pos.isLong
        ? (mark - pos.entry) / pos.entry
        : (pos.entry - mark) / pos.entry
      return acc + pct * pos.sizeUSD
    }, 0)
  }, [positions, prices])

  const loading = account && balances === null

  const stats = [
    { label: 'Total Balance',    value: loading ? '…' : fmtUsd(totalValue ?? 0), icon: <DollarSign size={16} />, mono: true },
    { label: 'Unrealized PnL',   value: loading ? '…' : (openPnl >= 0 ? '+' : '') + fmtUsd(openPnl), icon: <TrendingUp size={16} />, mono: true },
    { label: 'Trading Points',   value: pts ? String(pts.pts) : '—', icon: <BarChart2 size={16} />, mono: true },
    { label: 'Trade Streak',     value: pts ? `${pts.streak}d` : '—', icon: <Percent size={16} />, mono: true },
  ]

  const donutTotal = totalValue || 0

  return (
    <div className={styles.page}>
      <div className={styles.statsGrid}>
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div className={styles.grid}>
        {/* Allocation chart */}
        <Card className={styles.allocationCard}>
          <CardHeader>
            <CardTitle>Allocation</CardTitle>
          </CardHeader>
          <div className={styles.donutPlaceholder}>
            <div className={styles.donutRing} />
            <div className={styles.donutCenter}>
              <span className={styles.donutValue}>{donutTotal > 0 ? fmtUsd(donutTotal, 0) : '—'}</span>
              <span className={styles.donutLabel}>Total</span>
            </div>
          </div>
          <div className={styles.legend}>
            {holdings.map((h) => (
              <div key={h.asset} className={styles.legendRow}>
                <div className={styles.legendDot} style={{ background: `hsl(${h.asset.charCodeAt(0) * 37 % 360}, 60%, 55%)` }} />
                <span className={styles.legendLabel}>{h.asset}</span>
                <span className={styles.legendPct}>{h.allocation}%</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Spot holdings table */}
        <Card padding="none" className={styles.holdingsCard}>
          <CardHeader className={styles.tableHeader}>
            <CardTitle>Holdings</CardTitle>
          </CardHeader>
          {holdings.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell header>Asset</TableCell>
                  <TableCell header align="right">Amount</TableCell>
                  <TableCell header align="right">Value</TableCell>
                  <TableCell header align="right">Allocation</TableCell>
                  <TableCell header align="right">PnL</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {holdings.map((h) => (
                  <TableRow key={h.asset}>
                    <TableCell>
                      <div className={styles.assetCell}>
                        <div
                          className={styles.assetIcon}
                          style={{ background: `hsl(${h.asset.charCodeAt(0) * 37 % 360}, 60%, 92%)`, color: `hsl(${h.asset.charCodeAt(0) * 37 % 360}, 60%, 40%)` }}
                        >
                          {h.asset[0]}
                        </div>
                        <div>
                          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', fontFamily: 'var(--font-mono)' }}>{h.asset}</div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{h.name}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell align="right"><span className="mono">{h.amount}</span></TableCell>
                    <TableCell align="right"><span className="mono">{h.value}</span></TableCell>
                    <TableCell align="right">
                      <div className={styles.allocationBar}>
                        <div
                          className={styles.allocationFill}
                          style={{ width: `${Math.min(h.allocation, 100)}%`, background: `hsl(${h.asset.charCodeAt(0) * 37 % 360}, 60%, 55%)` }}
                        />
                        <span className="mono" style={{ fontSize: 'var(--text-xs)' }}>{h.allocation}%</span>
                      </div>
                    </TableCell>
                    <TableCell align="right">
                      <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>—</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
              {account ? (loading ? 'Loading…' : 'No balances found') : 'Connect wallet to view holdings'}
            </div>
          )}
        </Card>
      </div>

      {/* Open perp positions */}
      {positions.length > 0 && (
        <Card padding="none">
          <CardHeader style={{ padding: 'var(--space-4) var(--space-6) 0' }}>
            <CardTitle>Open Positions</CardTitle>
          </CardHeader>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell header>Contract</TableCell>
                <TableCell header>Side</TableCell>
                <TableCell header align="right">Collateral</TableCell>
                <TableCell header align="right">Size</TableCell>
                <TableCell header align="right">Entry</TableCell>
                <TableCell header align="right">Mark</TableCell>
                <TableCell header align="right">PnL</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {positions.map((pos) => {
                const mark   = prices[pos.sym] || pos.entry
                const pct    = pos.isLong
                  ? (mark - pos.entry) / pos.entry
                  : (pos.entry - mark) / pos.entry
                const pnlUsd = pct * pos.sizeUSD
                return (
                  <TableRow key={pos.id}>
                    <TableCell><span className="mono" style={{ fontWeight: 'var(--weight-semibold)' }}>{pos.sym}-PERP</span></TableCell>
                    <TableCell>
                      <Badge variant={pos.isLong ? 'success' : 'danger'}>{pos.isLong ? 'Long' : 'Short'}</Badge>
                    </TableCell>
                    <TableCell align="right"><span className="mono">{fmtUsd(pos.colUSD)}</span></TableCell>
                    <TableCell align="right"><span className="mono">{fmtUsd(pos.sizeUSD)}</span></TableCell>
                    <TableCell align="right"><span className="mono">{fmtUsd(pos.entry)}</span></TableCell>
                    <TableCell align="right"><span className="mono">{fmtUsd(mark)}</span></TableCell>
                    <TableCell align="right">
                      <span className={`mono ${pnlUsd >= 0 ? 'text-positive' : 'text-negative'}`} style={{ fontWeight: 'var(--weight-medium)' }}>
                        {pnlUsd >= 0 ? '+' : ''}{fmtUsd(pnlUsd)}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
