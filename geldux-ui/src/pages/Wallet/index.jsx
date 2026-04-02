import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Copy, ExternalLink } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, Badge, Button, Table, TableHead, TableBody, TableRow, TableCell } from '@/components/ui'
import { useWallet } from '@/contexts/WalletContext'
import { useAppData } from '@/contexts/DataContext'
import styles from './Wallet.module.css'

const TX_VARIANT = {
  Deposit:    'success',
  Withdrawal: 'danger',
  Transfer:   'accent',
  spot:       'default',
  perp:       'default',
}

function fmtBal(n, dec = 2) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

function fmtUsd(n) {
  if (n == null || n === 0) return '$0.00'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

function truncHash(h) {
  if (!h) return '—'
  return h.slice(0, 8) + '…' + h.slice(-6)
}

export default function Wallet() {
  const { account, connect, isConnecting }                = useWallet()
  const { balances, tradeHistory, prices }                = useAppData()

  /* Compute total balance value */
  const totalValue = balances
    ? (balances.USDC    || 0) * 1 +
      (balances.ETH_TKN || 0) * (prices.ETH  || 0) +
      (balances.SOL_TKN || 0) * (prices.SOL  || 0) +
      (balances.BSLV    || 0) * (prices.BSLV || 0)
    : null

  const loading = account && balances === null

  const assetRows = balances
    ? [
        { asset: 'USDC',    avail: fmtBal(balances.USDC    || 0),    orders: '—', usd: fmtUsd((balances.USDC    || 0) * 1)              },
        { asset: 'ETH',     avail: fmtBal(balances.ETH_TKN || 0, 4), orders: '—', usd: fmtUsd((balances.ETH_TKN || 0) * (prices.ETH  || 0)) },
        { asset: 'SOL',     avail: fmtBal(balances.SOL_TKN || 0, 4), orders: '—', usd: fmtUsd((balances.SOL_TKN || 0) * (prices.SOL  || 0)) },
        { asset: 'BSLV',    avail: fmtBal(balances.BSLV    || 0, 4), orders: '—', usd: fmtUsd((balances.BSLV    || 0) * (prices.BSLV || 0)) },
      ]
    : []

  return (
    <div className={styles.page}>
      {/* Balance header */}
      <Card className={styles.balanceCard}>
        <div className={styles.balanceMain}>
          <div>
            <p className={styles.balanceLabel}>Total Balance</p>
            <p className={styles.balanceValue}>
              {loading ? '…' : totalValue != null ? fmtUsd(totalValue) : '$0.00'}
            </p>
            <p className={styles.balanceChange + ' text-positive'}>
              {account ? 'Base Sepolia Testnet' : 'Connect wallet to view'}
            </p>
          </div>
          <div className={styles.balanceActions}>
            {account ? (
              <>
                <Button variant="primary"    icon={<ArrowDownToLine  size={15} />}>Deposit</Button>
                <Button variant="secondary"  icon={<ArrowUpFromLine  size={15} />}>Withdraw</Button>
                <Button variant="secondary"  icon={<ArrowLeftRight   size={15} />}>Transfer</Button>
              </>
            ) : (
              <Button variant="primary" onClick={connect} disabled={isConnecting}>
                {isConnecting ? 'Connecting…' : 'Connect Wallet'}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className={styles.grid}>
        {/* Asset balances */}
        <Card padding="none">
          <CardHeader className={styles.innerHeader}>
            <CardTitle>Asset Balances</CardTitle>
          </CardHeader>
          {assetRows.length > 0 ? (
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
                {assetRows.map((r) => (
                  <TableRow key={r.asset}>
                    <TableCell><span className="mono" style={{ fontWeight: 'var(--weight-semibold)' }}>{r.asset}</span></TableCell>
                    <TableCell align="right"><span className="mono">{r.avail}</span></TableCell>
                    <TableCell align="right"><span className="mono text-muted">{r.orders}</span></TableCell>
                    <TableCell align="right"><span className="mono">{r.usd}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
              {loading ? 'Loading…' : 'No balances'}
            </div>
          )}
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
              <code className={styles.address}>{account || 'Not connected'}</code>
              {account && (
                <button
                  className={styles.copyBtn}
                  aria-label="Copy address"
                  onClick={() => navigator.clipboard?.writeText(account)}
                >
                  <Copy size={14} />
                </button>
              )}
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
        {tradeHistory.length > 0 ? (
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
              {tradeHistory.map((t, i) => {
                const type   = (t.type || 'Trade').charAt(0).toUpperCase() + (t.type || 'Trade').slice(1)
                const side   = t.side || ''
                const amount = t.amount_usd
                  ? (side === 'sell' || side === 'short' ? '-' : '+') +
                    '$' + Number(t.amount_usd).toFixed(2)
                  : '—'
                return (
                  <TableRow key={i}>
                    <TableCell><Badge variant={TX_VARIANT[t.type] || 'default'}>{type}</Badge></TableCell>
                    <TableCell><span className="mono">{t.asset || '—'}</span></TableCell>
                    <TableCell align="right">
                      <span className={`mono ${amount.startsWith('+') ? 'text-positive' : amount.startsWith('-') ? 'text-negative' : ''}`} style={{ fontWeight: 'var(--weight-medium)' }}>
                        {amount}
                      </span>
                    </TableCell>
                    <TableCell><Badge variant="success" dot>filled</Badge></TableCell>
                    <TableCell><span className="text-muted">{relTime(t.created_at)}</span></TableCell>
                    <TableCell>
                      <div className={styles.hashCell}>
                        <code style={{ fontSize: 'var(--text-xs)' }}>{truncHash(t.tx_hash)}</code>
                        {t.tx_hash && (
                          <a
                            href={`https://sepolia.basescan.org/tx/${t.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.copyBtn}
                            aria-label="View on explorer"
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
            {account ? 'No transactions yet' : 'Connect wallet to see history'}
          </div>
        )}
      </Card>
    </div>
  )
}
