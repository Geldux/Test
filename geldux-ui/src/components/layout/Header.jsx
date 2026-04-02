import { useLocation } from 'react-router-dom'
import { Bell, Search, Wallet } from 'lucide-react'
import styles from './Header.module.css'
import { useWallet } from '@/contexts/WalletContext'
import { useAppData } from '@/contexts/DataContext'

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/markets':   'Markets',
  '/portfolio': 'Portfolio',
  '/wallet':    'Wallet',
  '/settings':  'Settings',
}

function truncAddr(a) {
  return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''
}

export default function Header() {
  const { pathname }                       = useLocation()
  const { account, isConnecting, connect } = useWallet()
  const { notifications }                  = useAppData()

  const title  = PAGE_TITLES[pathname] ?? 'Geldux'
  const unread = notifications.filter((n) => !n.is_read).length

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <span className={styles.mobileLogo}>Geldux</span>
        <h1 className={styles.title}>{title}</h1>
      </div>

      <div className={styles.right}>
        <button className={styles.iconBtn} aria-label="Search">
          <Search size={17} strokeWidth={1.75} />
        </button>
        <button className={styles.iconBtn} aria-label="Notifications">
          <Bell size={17} strokeWidth={1.75} />
          {unread > 0 && <span className={styles.notifDot} aria-hidden="true" />}
        </button>
        <div className={styles.networkBadge}>
          <span className={styles.networkDot} />
          <span className={styles.networkLabel}>Testnet</span>
        </div>

        {account ? (
          <div className={styles.addressChip}>
            <span className={styles.addressDot} />
            <span className={styles.addressText}>{truncAddr(account)}</span>
          </div>
        ) : (
          <button
            className={styles.connectBtn}
            onClick={connect}
            disabled={isConnecting}
          >
            <Wallet size={13} />
            <span>{isConnecting ? 'Connecting…' : 'Connect'}</span>
          </button>
        )}
      </div>
    </header>
  )
}
