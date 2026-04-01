import { useLocation } from 'react-router-dom'
import { Menu, Bell, Search } from 'lucide-react'
import styles from './Header.module.css'

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/markets':   'Markets',
  '/spot':      'Spot Trading',
  '/perps':     'Perpetuals',
  '/portfolio': 'Portfolio',
  '/wallet':    'Wallet',
  '/settings':  'Settings',
}

export default function Header({ onMenuClick }) {
  const { pathname } = useLocation()
  const title = PAGE_TITLES[pathname] ?? 'Geldux'

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button
          className={styles.menuBtn}
          onClick={onMenuClick}
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
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
          Mainnet
        </div>
      </div>
    </header>
  )
}
