import { truncAddr, fmtUsdcCompact } from '@/utils/format'

/* Hexagonal G logo mark */
function LogoMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path
        d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
        fill="url(#ggrad)"
      />
      <path
        d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
        fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5"
      />
      <path
        d="M17.5 12H13.5C12.67 12 12 12.67 12 13.5V18.5C12 19.33 12.67 20 13.5 20H17.5V16.5H15.5V15H19V20H13.5C11.84 20 10.5 18.66 10.5 17V15C10.5 13.34 11.84 12 13.5 12H17.5V13.5"
        fill="white" fillOpacity="0.95"
      />
      <defs>
        <linearGradient id="ggrad" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#2a6eff" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* ── Desktop Header ─────────────────────────────────────────────────────── */
export function DesktopHeader({ account, isConnecting, connect, disconnect, pts, level, onPointsClick }) {
  return (
    <header className="d-header desktop-only">
      <div className="d-header-logo">
        <LogoMark size={30} />
        <span className="d-header-logo-name">Geldux</span>
        <span className="badge badge-warning" style={{ fontSize: 10, marginLeft: 4 }}>TESTNET</span>
      </div>
      <div className="d-header-spacer" />
      <div className="d-header-right">
        {account && (
          <button className="points-badge" onClick={onPointsClick}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L10.06 5.26L14.83 5.93L11.41 9.27L12.24 14L8 11.77L3.76 14L4.59 9.27L1.17 5.93L5.94 5.26L8 1Z" fill="#2a6eff" fillOpacity="0.9"/>
            </svg>
            <span className="points-badge-score">{pts.toLocaleString()}</span>
            <span className="points-badge-label">{level.name}</span>
          </button>
        )}
        {account ? (
          <button className="btn btn-secondary wallet-btn" onClick={disconnect}>
            <span className="wallet-dot connected" />
            {truncAddr(account)}
          </button>
        ) : (
          <button
            className="btn btn-primary wallet-btn"
            onClick={connect}
            disabled={isConnecting}
          >
            {isConnecting ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Connecting…</> : 'Connect Wallet'}
          </button>
        )}
      </div>
    </header>
  )
}

/* ── Mobile Header ──────────────────────────────────────────────────────── */
export function MobileHeader({ account, isConnecting, connect, disconnect, pts, level, onPointsClick }) {
  return (
    <header className="m-header mobile-only">
      <LogoMark size={26} />
      <span className="m-header-logo">Geldux</span>
      <span className="badge badge-warning" style={{ fontSize: 9 }}>TESTNET</span>
      <div className="m-header-spacer" />
      {account && (
        <button
          className="points-badge"
          onClick={onPointsClick}
          style={{ padding: '3px 8px 3px 6px', gap: 4 }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L10.06 5.26L14.83 5.93L11.41 9.27L12.24 14L8 11.77L3.76 14L4.59 9.27L1.17 5.93L5.94 5.26L8 1Z" fill="#2a6eff"/>
          </svg>
          <span className="points-badge-score" style={{ fontSize: 12 }}>{pts >= 1000 ? fmtUsdcCompact(pts) : pts}</span>
        </button>
      )}
      {account ? (
        <button className="btn btn-secondary btn-sm" onClick={disconnect}>
          <span className="wallet-dot connected" style={{ width: 6, height: 6 }} />
          {truncAddr(account)}
        </button>
      ) : (
        <button className="btn btn-primary btn-sm" onClick={connect} disabled={isConnecting}>
          {isConnecting ? 'Connecting…' : 'Connect'}
        </button>
      )}
    </header>
  )
}
