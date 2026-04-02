import { useState, useEffect } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Copy, ExternalLink, Droplets } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, Badge, Button, Table, TableHead, TableBody, TableRow, TableCell } from '@/components/ui'
import { useWallet } from '@/contexts/WalletContext'
import { useAppData } from '@/contexts/DataContext'
import { useToast } from '@/contexts/ToastContext'
import { claimFaucet, getFauCd } from '@/services/web3/data'
import { EXPLORER } from '@/services/web3/config'
import styles from './Wallet.module.css'

const TX_VARIANT = {
  spot:  'default',
  perp:  'accent',
}

function fmtBal(n, dec = 2) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
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

function fmtCooldown(sec) {
  if (!sec || sec <= 0) return null
  const h = Math.floor(sec / 3600)
  const m = Math.ceil((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function Wallet() {
  const { account, connect, isConnecting }   = useWallet()
  const { balances, tradeHistory, prices, refresh } = useAppData()
  const { showToast }                        = useToast()

  /* ── Faucet state ───────────────────────────────────────────────────── */
  const [faucetCd,      setFaucetCd]      = useState(null)  /* null=loading, 0=ready, N=cooldown sec */
  const [faucetPending, setFaucetPending] = useState(false)
  const [faucetHash,    setFaucetHash]    = useState(null)

  useEffect(() => {
    if (!account) { setFaucetCd(null); return }
    getFauCd().then((cd) => setFaucetCd(cd)).catch(() => setFaucetCd(0))
  }, [account])

  const handleClaim = async () => {
    setFaucetPending(true)
    setFaucetHash(null)
    try {
      const hash = await claimFaucet()
      setFaucetHash(hash)
      showToast(`Faucet claimed · Tx: ${hash.slice(0, 10)}…`, 'success')
      setFaucetCd(86_400)   /* approximate 24 h cooldown */
      setTimeout(refresh, 4000)
    } catch (e) {
      showToast(e.message || 'Claim failed', 'error')
      /* re-check cooldown in case the error was a cooldown error */
      getFauCd().then((cd) => setFaucetCd(cd)).catch(() => {})
    } finally {
      setFaucetPending(false)
    }
  }

  /* ── Derived values ─────────────────────────────────────────────────── */
  const totalValue = balances
    ? (balances.USDC    || 0) * 1 +
      (balances.ETH_TKN || 0) * (prices.ETH  || 0) +
      (balances.SOL_TKN || 0) * (prices.SOL  || 0) +
      (balances.BSLV    || 0) * (prices.BSLV || 0)
    : null

  const loading = account && balances === null

  const assetRows = balances ? [
    { asset: 'USDC', avail: fmtBal(balances.USDC    || 0),    usd: fmtUsd((balances.USDC    || 0) * 1)              },
    { asset: 'ETH',  avail: fmtBal(balances.ETH_TKN || 0, 4), usd: fmtUsd((balances.ETH_TKN || 0) * (prices.ETH  || 0)) },
    { asset: 'SOL',  avail: fmtBal(balances.SOL_TKN || 0, 4), usd: fmtUsd((balances.SOL_TKN || 0) * (prices.SOL  || 0)) },
    { asset: 'BSLV', avail: fmtBal(balances.BSLV    || 0, 4), usd: fmtUsd((balances.BSLV    || 0) * (prices.BSLV || 0)) },
  ] : []

  const faucetReady    = account && faucetCd === 0
  const faucetOnCd     = account && faucetCd > 0
  const faucetChecking = account && faucetCd === null

  return (
    <div className={styles.page}>

      {/* ── Balance hero ──────────────────────────────────────────────── */}
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
                <Button variant="primary"   icon={<ArrowDownToLine size={15} />}>Deposit</Button>
                <Button variant="secondary" icon={<ArrowUpFromLine size={15} />}>Withdraw</Button>
                <Button variant="secondary" icon={<ArrowLeftRight  size={15} />}>Transfer</Button>
              </>
            ) : (
              <Button variant="primary" onClick={connect} disabled={isConnecting}>
                {isConnecting ? 'Connecting…' : 'Connect Wallet'}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ── Asset balances + deposit address ──────────────────────────── */}
      <div className={styles.grid}>
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
                    <TableCell align="right"><span className="mono text-muted">—</span></TableCell>
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
                <button className={styles.copyBtn} aria-label="Copy address" onClick={() => navigator.clipboard?.writeText(account)}>
                  <Copy size={14} />
                </button>
              )}
            </div>
            <Badge variant="warning" dot>ERC-20 Network</Badge>
          </div>
        </Card>
      </div>

      {/* ── Testnet faucet ────────────────────────────────────────────── */}
      {account && (
        <Card>
          <CardHeader>
            <CardTitle>Testnet Faucet</CardTitle>
            <CardDescription>Claim USDC, ETH, SOL, and BSLV test tokens — once per day.</CardDescription>
          </CardHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              icon={<Droplets size={15} />}
              onClick={handleClaim}
              disabled={faucetPending || faucetOnCd || faucetChecking}
            >
              {faucetPending   ? 'Claiming…'  :
               faucetOnCd     ? 'On Cooldown' :
               faucetChecking ? 'Checking…'  :
               'Claim Tokens'}
            </Button>
            {faucetOnCd && (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
                Available in {fmtCooldown(faucetCd)}
              </span>
            )}
            {faucetReady && !faucetHash && (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)' }}>
                Ready to claim
              </span>
            )}
            {faucetHash && (
              <a
                href={`${EXPLORER}/tx/${faucetHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 'var(--text-sm)', color: 'var(--color-accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <ExternalLink size={12} /> View on BaseScan
              </a>
            )}
          </div>
        </Card>
      )}

      {/* ── Transaction history ───────────────────────────────────────── */}
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
                const type   = (t.type || 'trade').charAt(0).toUpperCase() + (t.type || 'trade').slice(1)
                const side   = t.side || ''
                const amount = t.amount_usd
                  ? (side === 'sell' || side === 'short' ? '-' : '+') + '$' + Number(t.amount_usd).toFixed(2)
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
                          <a href={`https://sepolia.basescan.org/tx/${t.tx_hash}`} target="_blank" rel="noopener noreferrer" className={styles.copyBtn} aria-label="View on explorer">
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
