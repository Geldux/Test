const TABS = [
  { id: 'trade',     icon: '◈', label: 'Trade'     },
  { id: 'positions', icon: '▤', label: 'Positions'  },
  { id: 'orders',    icon: '☰', label: 'Orders'     },
  { id: 'portfolio', icon: '◉', label: 'Portfolio'  },
]

export function MobileNav({ active, onChange, posCount, orderCount }) {
  return (
    <nav className="m-nav mobile-only">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`m-nav-item ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.id === 'positions' && posCount > 0 && (
            <span className="m-nav-badge">{posCount}</span>
          )}
          {t.id === 'orders' && orderCount > 0 && (
            <span className="m-nav-badge">{orderCount}</span>
          )}
          <span className="m-nav-icon">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
