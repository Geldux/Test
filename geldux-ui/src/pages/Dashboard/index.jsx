import { DollarSign, TrendingUp, Activity, Layers } from 'lucide-react'
import { StatCard, Card, CardHeader, CardTitle, Badge, Table, TableHead, TableBody, TableRow, TableCell } from '@/components/ui'
import styles from './Dashboard.module.css'

const STATS = [
  { label: 'Portfolio Value',   value: '$84,320.00', change: 3.47,  period: '24h', icon: <DollarSign size={16} /> },
  { label: 'Open PnL',          value: '+$1,204.50', change: 1.83,  period: '24h', icon: <TrendingUp size={16} /> },
  { label: 'Total Volume',      value: '$412,880',   change: -0.62, period: '7d',  icon: <Activity size={16} />   },
  { label: 'Active Positions',  value: '7',          period: '—',   icon: <Layers size={16} />                   },
]

const RECENT_TRADES = [
  { pair: 'BTC / USDT', side: 'Buy',  size: '0.25',  price: '$62,140.00', time: '2m ago',  status: 'filled'  },
  { pair: 'ETH / USDT', side: 'Sell', size: '2.00',  price: '$3,012.50',  time: '18m ago', status: 'filled'  },
  { pair: 'SOL / USDT', side: 'Buy',  size: '12.00', price: '$148.30',    time: '1h ago',  status: 'filled'  },
  { pair: 'BTC / USDT', side: 'Buy',  size: '0.10',  price: '$61,900.00', time: '3h ago',  status: 'cancelled'},
]

export default function Dashboard() {
  return (
    <div className={styles.page}>
      {/* KPI grid */}
      <section className={styles.statsGrid} aria-label="Key metrics">
        {STATS.map((s) => (
          <StatCard key={s.label} {...s} mono />
        ))}
      </section>

      {/* Lower grid */}
      <div className={styles.grid}>
        {/* Recent trades */}
        <Card padding="none" className={styles.tradesCard}>
          <CardHeader className={styles.cardHeaderPadded}>
            <CardTitle>Recent Trades</CardTitle>
          </CardHeader>
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
              {RECENT_TRADES.map((t, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <span className="mono" style={{ fontSize: 'var(--text-sm)' }}>{t.pair}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.side === 'Buy' ? 'success' : 'danger'}>{t.side}</Badge>
                  </TableCell>
                  <TableCell align="right">
                    <span className="mono">{t.size}</span>
                  </TableCell>
                  <TableCell align="right">
                    <span className="mono">{t.price}</span>
                  </TableCell>
                  <TableCell align="right">
                    <span className="text-muted">{t.time}</span>
                  </TableCell>
                  <TableCell align="right">
                    <Badge variant={t.status === 'filled' ? 'default' : 'warning'}>
                      {t.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Market summary */}
        <Card className={styles.summaryCard}>
          <CardHeader>
            <CardTitle>Market Overview</CardTitle>
          </CardHeader>
          <div className={styles.marketList}>
            {[
              { symbol: 'BTC', price: '$62,140', change: 2.14  },
              { symbol: 'ETH', price: '$3,012',  change: -0.87 },
              { symbol: 'SOL', price: '$148.30', change: 5.31  },
              { symbol: 'BNB', price: '$568.20', change: 1.02  },
              { symbol: 'ARB', price: '$0.892',  change: -2.10 },
            ].map(({ symbol, price, change }) => (
              <div key={symbol} className={styles.marketRow}>
                <div className={styles.marketSymbol}>
                  <div className={styles.symbolDot} />
                  <span>{symbol}</span>
                </div>
                <span className="mono" style={{ fontSize: 'var(--text-sm)' }}>{price}</span>
                <span
                  className={change >= 0 ? 'text-positive' : 'text-negative'}
                  style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}
                >
                  {change >= 0 ? '+' : ''}{change}%
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
