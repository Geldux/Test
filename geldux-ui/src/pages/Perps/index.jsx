import { ChevronDown, AlertCircle } from 'lucide-react'
import { Card, CardHeader, CardTitle, Badge, Button, Input, Table, TableHead, TableBody, TableRow, TableCell } from '@/components/ui'
import styles from './Perps.module.css'

const POSITIONS = [
  { pair: 'BTC-PERP', side: 'Long',  size: '0.50 BTC', entry: '$61,200.00', mark: '$62,140.00', pnl: '+$470.00', pnlPct: 1.54,  liq: '$55,080.00', margin: '$3,060.00' },
  { pair: 'ETH-PERP', side: 'Short', size: '3.00 ETH', entry: '$3,080.00',  mark: '$3,012.50',  pnl: '+$202.50', pnlPct: 2.19,  liq: '$3,388.00',  margin: '$924.00'  },
  { pair: 'SOL-PERP', side: 'Long',  size: '25 SOL',   entry: '$152.00',    mark: '$148.30',    pnl: '-$92.50',  pnlPct: -0.97, liq: '$136.80',    margin: '$380.00'  },
]

export default function Perps() {
  return (
    <div className={styles.page}>
      {/* Pair bar */}
      <div className={styles.pairBar}>
        <button className={styles.pairSelector}>
          <span className={styles.pairName}>BTC-PERP</span>
          <ChevronDown size={15} />
        </button>
        <div className={styles.pairStats}>
          {[
            { label: 'Mark Price',  value: '$62,140.00', positive: true  },
            { label: 'Index Price', value: '$62,136.50', positive: null  },
            { label: '24h Change',  value: '+2.14%',     positive: true  },
            { label: 'Open Interest', value: '$4.2B',    positive: null  },
            { label: 'Funding Rate', value: '0.0100%',   positive: null  },
            { label: 'Next Funding', value: '04:32:11',  positive: null  },
          ].map(({ label, value, positive }) => (
            <div key={label} className={styles.pairStat}>
              <span className={styles.statLabel}>{label}</span>
              <span
                className={`mono ${positive === true ? 'text-positive' : positive === false ? 'text-negative' : ''}`}
                style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.grid}>
        {/* Chart */}
        <Card className={styles.chart} padding="none">
          <div className={styles.chartInner}>
            <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
              Chart component — connect your charting library here
            </span>
          </div>
        </Card>

        {/* Order form */}
        <Card className={styles.orderForm}>
          <div className={styles.sideTabs}>
            <button className={`${styles.sideTab} ${styles.longTab}`}>Long</button>
            <button className={`${styles.sideTab} ${styles.shortTab}`}>Short</button>
          </div>

          <div className={styles.leverageRow}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>Leverage</span>
            <div className={styles.leverageBadge}>10x</div>
          </div>
          <input type="range" min="1" max="100" defaultValue="10" className={styles.slider} />

          <div className={styles.formFields}>
            <Input label="Order Type" size="md" defaultValue="Limit" />
            <Input label="Price" trailing={<span style={{ fontSize: 'var(--text-xs)' }}>USDT</span>} placeholder="62,140.00" size="md" />
            <Input label="Size" trailing={<span style={{ fontSize: 'var(--text-xs)' }}>BTC</span>} placeholder="0.00" size="md" />
          </div>

          <div className={styles.summaryRows}>
            {[
              { label: 'Est. Margin',    value: '—' },
              { label: 'Est. Liq. Price', value: '—' },
              { label: 'Fees',           value: '~0.045%' },
            ].map(({ label, value }) => (
              <div key={label} className={styles.summaryRow}>
                <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>{label}</span>
                <span className="mono" style={{ fontSize: 'var(--text-xs)' }}>{value}</span>
              </div>
            ))}
          </div>

          <Button variant="primary" size="lg" fullWidth>
            Open Long Position
          </Button>
        </Card>
      </div>

      {/* Positions table */}
      <Card padding="none">
        <CardHeader className={styles.tableCardHeader}>
          <CardTitle>Open Positions</CardTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <AlertCircle size={14} style={{ color: 'var(--color-text-tertiary)' }} />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              Prices are mark prices
            </span>
          </div>
        </CardHeader>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell header>Contract</TableCell>
              <TableCell header>Side</TableCell>
              <TableCell header align="right">Size</TableCell>
              <TableCell header align="right">Entry Price</TableCell>
              <TableCell header align="right">Mark Price</TableCell>
              <TableCell header align="right">PnL</TableCell>
              <TableCell header align="right">Liq. Price</TableCell>
              <TableCell header align="right">Margin</TableCell>
              <TableCell header />
            </TableRow>
          </TableHead>
          <TableBody>
            {POSITIONS.map((p, i) => (
              <TableRow key={i}>
                <TableCell>
                  <span className="mono" style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>{p.pair}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={p.side === 'Long' ? 'success' : 'danger'}>{p.side}</Badge>
                </TableCell>
                <TableCell align="right"><span className="mono">{p.size}</span></TableCell>
                <TableCell align="right"><span className="mono">{p.entry}</span></TableCell>
                <TableCell align="right"><span className="mono">{p.mark}</span></TableCell>
                <TableCell align="right">
                  <span className={`mono ${p.pnlPct >= 0 ? 'text-positive' : 'text-negative'}`} style={{ fontWeight: 'var(--weight-medium)' }}>
                    {p.pnl} ({p.pnlPct >= 0 ? '+' : ''}{p.pnlPct}%)
                  </span>
                </TableCell>
                <TableCell align="right"><span className="mono text-muted">{p.liq}</span></TableCell>
                <TableCell align="right"><span className="mono text-muted">{p.margin}</span></TableCell>
                <TableCell align="right">
                  <Button variant="ghost" size="sm">Close</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
