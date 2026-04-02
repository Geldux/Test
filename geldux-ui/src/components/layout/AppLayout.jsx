import { useLocation } from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import MobileNav from './MobileNav'
import styles from './AppLayout.module.css'

// Trading routes bypass the standard header and content wrapper —
// they render their own full-height terminal layout.
const TRADING_ROUTES = ['/spot', '/perps']

export default function AppLayout() {
  const { pathname } = useLocation()
  const isTrading = TRADING_ROUTES.some((r) => pathname.startsWith(r))

  return (
    <div className={styles.root}>
      <Sidebar />

      <div className={`${styles.body} ${isTrading ? styles.tradingBody : ''}`}>
        {!isTrading && <Header />}

        <main className={`${styles.main} ${isTrading ? styles.tradingMain : ''}`}>
          {isTrading ? (
            <Outlet />
          ) : (
            <div className={styles.content}>
              <Outlet />
            </div>
          )}
        </main>
      </div>

      <MobileNav />
    </div>
  )
}
