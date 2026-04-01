import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Copy, ExternalLink } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, Badge, Button, Table, TableHead, TableBody, TableRow, TableCell } from '@/components/ui'
import styles from './Wallet.module.css'

const TRANSACTIONS = [
  { type: 'Deposit',    asset: 'USDT', amount: '+5,000.00', status: 'confirmed', time: '2h ago',  hash: '0x1a2b...9f0e' },
  { type: 'Withdrawal', asset: 'BTC',  amount: '-0.10',     status: 'confirmed', time: '1d ago',  hash: '0x3c4d...7a8b' },
  { type: 'Transfer',   asset: 'ETH',  amount: '-2.00',     status: 'pending',   time: '1d ago',  hash: '0x5e6f...1c2d' },
  { type: 'Deposit',    asset: 'ETH',  amount: '+5.00',     status: 'confirmed', time: '3d ago',  hash: '0x7g8h...3e4f' },
  { type: 'Deposit',    asset: 'USDT', amount: '+10,000.00',status: 'confirmed', time: '7d ago',  hash: '0x9i0j...5g6h' },
]

const TX_VARIANT = {
  Deposit:    'success',
  Withdrawal: 'danger',
  Transfer:   'accent',
}

export default function Wallet() {
  return (
    <div className={styles.page}>
      {/* Balance header */}
      <Card className={styles.balanceCard}>
        <div className={styles.balanceMain}>
          <div>
            <p className={styles.balanceLabel}>Total Balance</p>
            <p className={styles.balanceValue}>$84,320.00</p>
            <p className={styles.balanceChange + ' text-positive'}>+$1,204.50 today</p>
          </div>
          <div className={styles.balanceActions}>
            <Button variant="primary" icon={<ArrowDownToLine size={15} />}>Deposit</Button>
            <Button variant="secondary" icon={<ArrowUpFromLine size={15} />}>Withdraw</Button>
            <Button variant="secondary" icon={<ArrowLeftRight size={15} />}>Transfer</Button>
          </div>
        </div>
      </Card>

      <div className={styles.grid}>
        {/* Asset balances */}
        <Card padding="none">
          <CardHeader className={styles.innerHeader}>
            <CardTitle>Asset Balances</CardTitle>
          </CardHeader>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell header>Asset</TableCell>
                <TableCell header align="right">Available</TableCell>
                <TableCell header align="right">In Orders</TableCell>
                <TableCell header align="right">USD Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[
                { asset: 'USDT', avail: '12,480.00',  orders: '2,000.00',  usd: '$14,480.00' },
                { asset: 'BTC',  avail: '1.24',        orders: '0.00',      usd: '$77,053.60' },
                { asset: 'ETH',  avail: '10.00',       orders: '2.00',      usd: '$36,150.00' },
                { asset: 'SOL',  avail: '140.00',      orders: '0.00',      usd: '$20,762.00' },
              ].map((r) => (
                <TableRow key={r.asset}>
                  <TableCell>
                    <span className="mono" style={{ fontWeight: 'var(--weight-semibold)' }}>{r.asset}</span>
                  </TableCell>
                  <TableCell align="right"><span className="mono">{r.avail}</span></TableCell>
                  <TableCell align="right"><span className="mono text-muted">{r.orders}</span></TableCell>
                  <TableCell align="right"><span className="mono">{r.usd}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Wallet address */}
        <Card>
          <CardHeader>
            <CardTitle>Deposit Address</CardTitle>
            <CardDescription>Only send compatible assets to this address.</CardDescription>
          </CardHeader>
          <div className={styles.addressCard}>
            <div className={styles.qrPlaceholder}>QR</div>
            <div className={styles.addressRow}>
              <code className={styles.address}>0x4Fd2...8C3a1b</code>
              <button className={styles.copyBtn} aria-label="Copy address">
                <Copy size={14} />
              </button>
            </div>
            <Badge variant="warning" dot>ERC-20 Network</Badge>
          </div>
        </Card>
      </div>

      {/* Transaction history */}
      <Card padding="none">
        <CardHeader className={styles.innerHeader}>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell header>Type</TableCell>
              <TableCell header>Asset</TableCell>
              <TableCell header align="right">Amount</TableCell>
              <TableCell header>Status</TableCell>
              <TableCell header>Time</TableCell>
              <TableCell header>Tx Hash</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {TRANSACTIONS.map((t, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Badge variant={TX_VARIANT[t.type]}>{t.type}</Badge>
                </TableCell>
                <TableCell>
                  <span className="mono">{t.asset}</span>
                </TableCell>
                <TableCell align="right">
                  <span className={`mono ${t.amount.startsWith('+') ? 'text-positive' : t.amount.startsWith('-') ? 'text-negative' : ''}`} style={{ fontWeight: 'var(--weight-medium)' }}>
                    {t.amount}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={t.status === 'confirmed' ? 'success' : 'warning'} dot>{t.status}</Badge>
                </TableCell>
                <TableCell>
                  <span className="text-muted">{t.time}</span>
                </TableCell>
                <TableCell>
                  <div className={styles.hashCell}>
                    <code style={{ fontSize: 'var(--text-xs)' }}>{t.hash}</code>
                    <button className={styles.copyBtn} aria-label="View on explorer">
                      <ExternalLink size={12} />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
