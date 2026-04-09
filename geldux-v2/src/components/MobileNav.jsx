/* SVG icons for bottom nav */
const ICONS = {
  trade: (active) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  positions: (active) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="9" x2="9" y2="21" />
    </svg>
  ),
  orders: (active) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  portfolio: (active) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
}

const TABS = [
  { id: 'trade',     label: 'Trade'     },
  { id: 'positions', label: 'Positions' },
  { id: 'orders',    label: 'Orders'    },
  { id: 'portfolio', label: 'Portfolio' },
]

export function MobileNav({ active, onChange, posCount, orderCount }) {
  return (
    <nav className="m-nav mobile-only">
      {TABS.map((t) => {
        const isActive = active === t.id
        const count = t.id === 'positions' ? posCount : t.id === 'orders' ? orderCount : 0
        return (
          <button
            key={t.id}
            className={`m-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => onChange(t.id)}
          >
            {count > 0 && <span className="m-nav-badge">{count > 9 ? '9+' : count}</span>}
            <span className="m-nav-icon">{ICONS[t.id]?.(isActive)}</span>
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
