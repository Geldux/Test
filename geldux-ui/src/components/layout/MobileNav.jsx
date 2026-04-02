import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  ArrowLeftRight,
  BarChart2,
  PieChart,
} from 'lucide-react'
import styles from './MobileNav.module.css'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Home',     icon: LayoutDashboard },
  { to: '/markets',   label: 'Markets',  icon: TrendingUp      },
  { to: '/spot',      label: 'Spot',     icon: ArrowLeftRight  },
  { to: '/perps',     label: 'Perps',    icon: BarChart2       },
  { to: '/portfolio', label: 'Portfolio',icon: PieChart        },
]

export default function MobileNav() {
  return (
    <nav className={styles.nav} aria-label="Mobile navigation">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `${styles.item} ${isActive ? styles.active : ''}`
          }
        >
          <Icon size={20} strokeWidth={1.75} className={styles.icon} />
          <span className={styles.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
