import { useLocation } from 'react-router-dom'
import { Bell, Search } from 'lucide-react'
import styles from './Header.module.css'

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/markets':   'Markets',
  '/portfolio': 'Portfolio',
  '/wallet':    'Wallet',
  '/settings':  'Settings',
}

export default function Header() {
  const { pathname } = useLocation()
  const title = PAGE_TITLES[pathname] ?? 'Geldux'

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {/* Logo shown only on mobile (sidebar hidden) */}
        <span className={styles.mobileLogo}>Geldux</span>
        <h1 className={styles.title}>{title}</h1>
      </div>

      <div className={styles.right}>
        <button className={styles.iconBtn} aria-label="Search">
          <Search size={17} strokeWidth={1.75} />
        </button>
        <button className={styles.iconBtn} aria-label="Notifications">
          <Bell size={17} strokeWidth={1.75} />
          <span className={styles.notifDot} aria-hidden="true" />
        </button>
        <div className={styles.networkBadge}>
          <span className={styles.networkDot} />
          <span className={styles.networkLabel}>Testnet</span>
        </div>
      </div>
    </header>
  )
}
