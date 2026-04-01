import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  ArrowLeftRight,
  BarChart2,
  PieChart,
  Wallet,
  Settings,
  X,
} from 'lucide-react'
import styles from './Sidebar.module.css'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/markets',   label: 'Markets',    icon: TrendingUp       },
  { to: '/spot',      label: 'Spot',       icon: ArrowLeftRight   },
  { to: '/perps',     label: 'Perps',      icon: BarChart2        },
  { to: '/portfolio', label: 'Portfolio',  icon: PieChart         },
  { to: '/wallet',    label: 'Wallet',     icon: Wallet           },
]

const BOTTOM_ITEMS = [
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ open, onClose }) {
  return (
    <aside className={`${styles.sidebar} ${open ? styles.open : ''}`} aria-label="Main navigation">
      <div className={styles.header}>
        <span className={styles.logo}>Geldux</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      <nav className={styles.nav}>
        <ul className={styles.navList} role="list">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `${styles.navItem} ${isActive ? styles.active : ''}`
                }
                onClick={onClose}
              >
                <Icon size={17} className={styles.navIcon} strokeWidth={1.75} />
                <span className={styles.navLabel}>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.bottom}>
        <ul className={styles.navList} role="list">
          {BOTTOM_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `${styles.navItem} ${isActive ? styles.active : ''}`
                }
                onClick={onClose}
              >
                <Icon size={17} className={styles.navIcon} strokeWidth={1.75} />
                <span className={styles.navLabel}>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className={styles.userCard}>
          <div className={styles.avatar}>G</div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>Guest User</span>
            <span className={styles.userRole}>Testnet</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
