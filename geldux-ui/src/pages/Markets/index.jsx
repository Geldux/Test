import { Search } from 'lucide-react'
import { Card, Badge, Input, Table, TableHead, TableBody, TableRow, TableCell } from '@/components/ui'
import { useAppData } from '@/contexts/DataContext'
import styles from './Markets.module.css'

const MARKET_META = [
  { symbol: 'BTC',  name: 'Bitcoin',   category: 'Layer 1' },
  { symbol: 'ETH',  name: 'Ethereum',  category: 'Layer 1' },
  { symbol: 'SOL',  name: 'Solana',    category: 'Layer 1' },
  { symbol: 'BSLV', name: 'BaseLove',  category: 'DeFi'    },
]

const TABS = ['All', 'Layer 1', 'Layer 2', 'DeFi', 'Oracle']

function fmtPrice(sym, n) {
  if (!n) return '—'
  if (sym === 'BSLV') return `$${n.toFixed(4)}`
  if (n < 10)  return `$${n.toFixed(2)}`
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Markets() {
  const { prices } = useAppData()

  const markets = MARKET_META.map((m) => ({
    ...m,
    price:    fmtPrice(m.symbol, prices[m.symbol]),
    change24h: null,           /* no 24 h delta available yet */
  }))

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={tab === 'All'}
              className={`${styles.tab} ${tab === 'All' ? styles.activeTab : ''}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <Input
          leading={<Search size={15} />}
          placeholder="Search markets..."
          size="sm"
          className={styles.search}
        />
      </div>

      <Card padding="none">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell header>#</TableCell>
              <TableCell header>Asset</TableCell>
              <TableCell header align="right">Price</TableCell>
              <TableCell header align="right">24h Change</TableCell>
              <TableCell header align="right">Volume 24h</TableCell>
              <TableCell header align="right">Market Cap</TableCell>
              <TableCell header>Category</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {markets.map((m, i) => (
              <TableRow key={m.symbol} onClick={() => {}}>
                <TableCell>
                  <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>{i + 1}</span>
                </TableCell>
                <TableCell>
                  <div className={styles.assetCell}>
                    <div className={styles.assetIcon}>{m.symbol[0]}</div>
                    <div>
                      <div className={styles.assetSymbol}>{m.symbol}</div>
                      <div className={styles.assetName}>{m.name}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell align="right">
                  <span className="mono">{m.price}</span>
                </TableCell>
                <TableCell align="right">
                  <span className="text-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>—</span>
                </TableCell>
                <TableCell align="right">
                  <span className="mono text-muted">—</span>
                </TableCell>
                <TableCell align="right">
                  <span className="mono text-muted">—</span>
                </TableCell>
                <TableCell>
                  <Badge variant="default" size="sm">{m.category}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
