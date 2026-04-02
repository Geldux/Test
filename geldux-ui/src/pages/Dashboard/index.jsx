import { useMemo } from 'react'
import { DollarSign, TrendingUp, Activity, Layers } from 'lucide-react'
import { StatCard, Card, CardHeader, CardTitle, Badge, Table, TableHead, TableBody, TableRow, TableCell } from '@/components/ui'
import { useWallet } from '@/contexts/WalletContext'
import { useAppData } from '@/contexts/DataContext'
import styles from './Dashboard.module.css'

/* ── Formatters ──────────────────────────────────────────────────────────── */

function fmtUsd(n, dec = 2) {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

function fmtPrice(n) {
  if (n == null || n === 0) return '—'
  if (n < 1)    return '$' + n.toFixed(4)
  if (n < 100)  return '$' + n.toFixed(2)
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function relTime(iso) {
  if (!iso) return '—'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function Dashboard() {
  const { account }                                      = useWallet()
  const { balances, positions, prices, tradeHistory }    = useAppData()

  /* Portfolio value: sum of spot balances valued at live prices */
  const portfolioValue = useMemo(() => {
    if (!balances) return null
    return (
      (balances.USDC    || 0) * 1 +
      (balances.ETH_TKN || 0) * (prices.ETH  || 0) +
      (balances.SOL_TKN || 0) * (prices.SOL  || 0) +
      (balances.BSLV    || 0) * (prices.BSLV || 0)
    )
  }, [balances, prices])

  /* Unrealized PnL across all open perp positions */
  const openPnl = useMemo(() => {
    if (!positions.length) return null
    return positions.reduce((acc, pos) => {
      const mark = prices[pos.sym] || pos.entry
      const pct  = pos.isLong
        ? (mark - pos.entry) / pos.entry
        : (pos.entry - mark) / pos.entry
      return acc + pct * pos.sizeUSD
    }, 0)
  }, [positions, prices])

  /* Volume traded in the last 24 h */
  const vol24h = useMemo(() => {
    const cutoff = Date.now() - 86_400_000
    return tradeHistory
      .filter((t) => new Date(t.created_at).getTime() > cutoff)
      .reduce((s, t) => s + (Number(t.amount_usd) || 0), 0)
  }, [tradeHistory])

  const loading = account && balances === null

  const stats = [
    {
      label: 'Portfolio Value',
      value: loading ? '…' : portfolioValue != null ? fmtUsd(portfolioValue) : '$0.00',
      icon:  <DollarSign size={16} />,
      mono:  true,
    },
    {
      label: 'Open PnL',
      value: loading ? '…' : openPnl != null
        ? (openPnl >= 0 ? '+' : '') + fmtUsd(openPnl)
        : '$0.00',
      icon: <TrendingUp size={16} />,
      mono: true,
    },
    {
      label: '24h Volume',
      value: fmtUsd(vol24h, 0),
      period: '24h',
      icon:  <Activity size={16} />,
      mono:  true,
    },
    {
      label: 'Active Positions',
      value: String(positions.length),
      period: '—',
      icon:  <Layers size={16} />,
    },
  ]

  /* Map Supabase trade rows to table display format */
  const tradeRows = tradeHistory.slice(0, 6).map((t) => {
    const tokenAmt = t.price_usd > 0
      ? (t.amount_usd / t.price_usd).toFixed(4)
      : fmtUsd(t.amount_usd)
    return {
      pair:   `${t.asset || '?'} / USDT`,
      side:   (t.side || 'buy').charAt(0).toUpperCase() + (t.side || 'buy').slice(1),
      size:   tokenAmt,
      price:  fmtUsd(t.price_usd),
      time:   relTime(t.created_at),
      status: 'filled',
    }
  })

  const marketItems = [
    { symbol: 'BTC',  price: fmtPrice(prices.BTC)  },
    { symbol: 'ETH',  price: fmtPrice(prices.ETH)  },
    { symbol: 'SOL',  price: fmtPrice(prices.SOL)  },
    { symbol: 'BSLV', price: fmtPrice(prices.BSLV) },
  ]

  return (
    <div className={styles.page}>
      {/* KPI grid */}
      <section className={styles.statsGrid} aria-label="Key metrics">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </section>

      {/* Lower grid */}
      <div className={styles.grid}>
        {/* Recent trades */}
        <Card padding="none" className={styles.tradesCard}>
          <CardHeader className={styles.cardHeaderPadded}>
            <CardTitle>Recent Trades</CardTitle>
          </CardHeader>
          {tradeRows.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell header>Pair</TableCell>
                  <TableCell header>Side</TableCell>
                  <TableCell header align="right">Size</TableCell>
                  <TableCell header align="right">Price</TableCell>
                  <TableCell header align="right">Time</TableCell>
                  <TableCell header align="right">Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tradeRows.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <span className="mono" style={{ fontSize: 'var(--text-sm)' }}>{t.pair}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.side === 'Buy' ? 'success' : 'danger'}>{t.side}</Badge>
                    </TableCell>
                    <TableCell align="right"><span className="mono">{t.size}</span></TableCell>
                    <TableCell align="right"><span className="mono">{t.price}</span></TableCell>
                    <TableCell align="right"><span className="text-muted">{t.time}</span></TableCell>
                    <TableCell align="right">
                      <Badge variant="default">{t.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
              {account ? 'No trade history yet' : 'Connect wallet to see trades'}
            </div>
          )}
        </Card>

        {/* Market summary */}
        <Card className={styles.summaryCard}>
          <CardHeader>
            <CardTitle>Market Overview</CardTitle>
          </CardHeader>
          <div className={styles.marketList}>
            {marketItems.map(({ symbol, price }) => (
              <div key={symbol} className={styles.marketRow}>
                <div className={styles.marketSymbol}>
                  <div className={styles.symbolDot} />
                  <span>{symbol}</span>
                </div>
                <span className="mono" style={{ fontSize: 'var(--text-sm)' }}>{price}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
