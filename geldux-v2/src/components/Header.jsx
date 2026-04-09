import { truncAddr } from '@/utils/format'

/* ── Logo mark ──────────────────────────────────────────────────── */
function LogoMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 2L28 9V23L16 30L4 23V9L16 2Z" fill="url(#gg)" />
      <path d="M16 2L28 9V23L16 30L4 23V9L16 2Z" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
      <path d="M17.5 12H13.5C12.67 12 12 12.67 12 13.5V18.5C12 19.33 12.67 20 13.5 20H17.5V16.5H15.5V15H19V20H13.5C11.84 20 10.5 18.66 10.5 17V15C10.5 13.34 11.84 12 13.5 12H17.5V13.5" fill="white" fillOpacity="0.95" />
      <defs>
        <linearGradient id="gg" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00c805" />
          <stop offset="1" stopColor="#00a004" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* ── Sun icon ───────────────────────────────────────────────────── */
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

/* ── Moon icon ──────────────────────────────────────────────────── */
function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

/* ── Desktop Header ─────────────────────────────────────────────── */
export function DesktopHeader({
  account, isConnecting, chainOk,
  pts, level, connect, disconnect,
  onPointsClick, isDark, onToggleTheme,
  page, onPageChange,
}) {
  const NAV = [
    { id: 'trade',     label: 'Trade'     },
    { id: 'spot',      label: 'Spot'      },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'rewards',   label: 'Rewards'   },
  ]

  return (
    <header className="d-header desktop-only">
      {/* Logo */}
      <div className="d-header-logo">
        <LogoMark size={28} />
        <span className="d-header-logo-name">Geldux</span>
        <span className="badge badge-warning" style={{ fontSize: 10, marginLeft: 2 }}>TESTNET</span>
      </div>

      {/* Page nav */}
      <nav style={{ display: 'flex', gap: 2, marginLeft: 20 }}>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-tab ${page === n.id ? 'active' : ''}`}
            onClick={() => onPageChange(n.id)}
          >
            {n.label}
          </button>
        ))}
      </nav>

      <div className="d-header-spacer" />

      {/* Right actions */}
      <div className="d-header-right">
        {/* Theme toggle */}
        <button
          className="btn btn-icon btn-ghost"
          onClick={onToggleTheme}
          title={isDark ? 'Light mode' : 'Dark mode'}
          style={{ color: 'var(--text-3)' }}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>

        {/* Points */}
        {account && (
          <button className="points-badge" onClick={onPointsClick}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L10.06 5.26L14.83 5.93L11.41 9.27L12.24 14L8 11.77L3.76 14L4.59 9.27L1.17 5.93L5.94 5.26L8 1Z"
                fill="var(--blue)" />
            </svg>
            <span className="points-badge-score">{(pts || 0).toLocaleString()}</span>
            <span className="points-badge-label">{level?.name || 'Rookie'}</span>
          </button>
        )}

        {/* Wallet */}
        {account ? (
          <button className="wallet-btn" onClick={disconnect}>
            <span className="wallet-dot connected" />
            {truncAddr(account)}
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={connect}
            disabled={isConnecting}
          >
            {isConnecting
              ? <><span className="spinner spinner-sm" /> Connecting…</>
              : 'Connect Wallet'}
          </button>
        )}
      </div>
    </header>
  )
}

/* ── Mobile Header ──────────────────────────────────────────────── */
export function MobileHeader({
  account, isConnecting, connect, disconnect,
  pts, level, onPointsClick, isDark, onToggleTheme,
}) {
  return (
    <header className="m-header mobile-only">
      <LogoMark size={24} />
      <span className="m-header-logo">Geldux</span>
      <span className="badge badge-warning" style={{ fontSize: 9 }}>TESTNET</span>

      <div className="m-header-spacer" />

      {/* Theme toggle */}
      <button
        className="btn btn-icon btn-ghost btn-sm"
        onClick={onToggleTheme}
        style={{ color: 'var(--text-3)', width: 30, height: 30 }}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>

      {/* Points badge (compact) */}
      {account && (
        <button
          className="points-badge"
          onClick={onPointsClick}
          style={{ padding: '3px 8px 3px 7px', gap: 4 }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L10.06 5.26L14.83 5.93L11.41 9.27L12.24 14L8 11.77L3.76 14L4.59 9.27L1.17 5.93L5.94 5.26L8 1Z"
              fill="var(--blue)" />
          </svg>
          <span className="points-badge-score" style={{ fontSize: 12 }}>
            {pts >= 1000 ? (pts / 1000).toFixed(1) + 'k' : pts || 0}
          </span>
        </button>
      )}

      {/* Wallet */}
      {account ? (
        <button className="btn btn-secondary btn-sm" onClick={disconnect}>
          <span className="wallet-dot connected" style={{ width: 6, height: 6 }} />
          {truncAddr(account)}
        </button>
      ) : (
        <button
          className="btn btn-primary btn-sm"
          onClick={connect}
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting…' : 'Connect'}
        </button>
      )}
    </header>
  )
}
