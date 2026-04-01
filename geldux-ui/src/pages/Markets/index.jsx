import { Search } from 'lucide-react'
import { Card, Badge, Input, Table, TableHead, TableBody, TableRow, TableCell } from '@/components/ui'
import styles from './Markets.module.css'

const MARKETS = [
  { symbol: 'BTC',  name: 'Bitcoin',         price: '$62,140.00', change24h: 2.14,  volume: '$28.4B',  cap: '$1.22T', category: 'Layer 1' },
  { symbol: 'ETH',  name: 'Ethereum',        price: '$3,012.50',  change24h: -0.87, volume: '$14.1B',  cap: '$362B',  category: 'Layer 1' },
  { symbol: 'SOL',  name: 'Solana',          price: '$148.30',    change24h: 5.31,  volume: '$3.8B',   cap: '$67.2B', category: 'Layer 1' },
  { symbol: 'BNB',  name: 'BNB',             price: '$568.20',    change24h: 1.02,  volume: '$1.9B',   cap: '$83.4B', category: 'Layer 1' },
  { symbol: 'ARB',  name: 'Arbitrum',        price: '$0.892',     change24h: -2.10, volume: '$420M',   cap: '$3.6B',  category: 'Layer 2' },
  { symbol: 'OP',   name: 'Optimism',        price: '$2.14',      change24h: 3.40,  volume: '$310M',   cap: '$2.8B',  category: 'Layer 2' },
  { symbol: 'AVAX', name: 'Avalanche',       price: '$34.80',     change24h: -1.22, volume: '$620M',   cap: '$14.2B', category: 'Layer 1' },
  { symbol: 'LINK', name: 'Chainlink',       price: '$14.20',     change24h: 0.88,  volume: '$440M',   cap: '$8.4B',  category: 'Oracle'  },
]

const TABS = ['All', 'Layer 1', 'Layer 2', 'DeFi', 'Oracle']

export default function Markets() {
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
            {MARKETS.map((m, i) => (
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
                  <span className={m.change24h >= 0 ? 'text-positive' : 'text-negative'}
                        style={{ fontWeight: 'var(--weight-medium)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                    {m.change24h >= 0 ? '+' : ''}{m.change24h}%
                  </span>
                </TableCell>
                <TableCell align="right">
                  <span className="mono text-muted">{m.volume}</span>
                </TableCell>
                <TableCell align="right">
                  <span className="mono text-muted">{m.cap}</span>
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
