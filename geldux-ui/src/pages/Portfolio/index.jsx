import { DollarSign, TrendingUp, BarChart2, Percent } from 'lucide-react'
import { StatCard, Card, CardHeader, CardTitle, Badge, Table, TableHead, TableBody, TableRow, TableCell } from '@/components/ui'
import styles from './Portfolio.module.css'

const HOLDINGS = [
  { asset: 'BTC',  name: 'Bitcoin',   amount: '1.24 BTC',  value: '$77,053.60', allocation: 43.2, pnl: '+$8,240.00', pnlPct: 12.0  },
  { asset: 'ETH',  name: 'Ethereum',  amount: '12.0 ETH',  value: '$36,150.00', allocation: 20.3, pnl: '+$2,150.00', pnlPct: 6.3   },
  { asset: 'SOL',  name: 'Solana',    amount: '140 SOL',   value: '$20,762.00', allocation: 11.6, pnl: '-$638.00',   pnlPct: -2.98 },
  { asset: 'BNB',  name: 'BNB',       amount: '18 BNB',    value: '$10,227.60', allocation: 5.7,  pnl: '+$424.00',  pnlPct: 4.3   },
  { asset: 'USDT', name: 'Tether',    amount: '12,480 USDT', value: '$12,480.00', allocation: 7.0, pnl: '$0.00', pnlPct: 0.0 },
]

export default function Portfolio() {
  return (
    <div className={styles.page}>
      <div className={styles.statsGrid}>
        <StatCard label="Total Balance"    value="$84,320.00" change={3.47}  period="24h" icon={<DollarSign size={16} />} mono />
        <StatCard label="Unrealized PnL"   value="+$10,176.00" change={13.7} period="all" icon={<TrendingUp size={16} />} mono />
        <StatCard label="Day PnL"          value="+$1,204.50"  change={1.83}  period="24h" icon={<BarChart2 size={16} />}  mono />
        <StatCard label="Win Rate"         value="68.4%"       icon={<Percent size={16} />} mono />
      </div>

      <div className={styles.grid}>
        {/* Allocation chart placeholder */}
        <Card className={styles.allocationCard}>
          <CardHeader>
            <CardTitle>Allocation</CardTitle>
          </CardHeader>
          <div className={styles.donutPlaceholder}>
            <div className={styles.donutRing} />
            <div className={styles.donutCenter}>
              <span className={styles.donutValue}>$84,320</span>
              <span className={styles.donutLabel}>Total</span>
            </div>
          </div>
          <div className={styles.legend}>
            {HOLDINGS.map((h) => (
              <div key={h.asset} className={styles.legendRow}>
                <div className={styles.legendDot} style={{ background: `hsl(${h.asset.charCodeAt(0) * 37 % 360}, 60%, 55%)` }} />
                <span className={styles.legendLabel}>{h.asset}</span>
                <span className={styles.legendPct}>{h.allocation}%</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Holdings table */}
        <Card padding="none" className={styles.holdingsCard}>
          <CardHeader className={styles.tableHeader}>
            <CardTitle>Holdings</CardTitle>
          </CardHeader>
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
              {HOLDINGS.map((h) => (
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
                        style={{ width: `${h.allocation}%`, background: `hsl(${h.asset.charCodeAt(0) * 37 % 360}, 60%, 55%)` }}
                      />
                      <span className="mono" style={{ fontSize: 'var(--text-xs)' }}>{h.allocation}%</span>
                    </div>
                  </TableCell>
                  <TableCell align="right">
                    <div>
                      <div className={`mono ${h.pnlPct >= 0 ? 'text-positive' : 'text-negative'}`} style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}>
                        {h.pnl}
                      </div>
                      <div className={`mono ${h.pnlPct >= 0 ? 'text-positive' : 'text-negative'}`} style={{ fontSize: 'var(--text-xs)' }}>
                        {h.pnlPct >= 0 ? '+' : ''}{h.pnlPct}%
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  )
}
