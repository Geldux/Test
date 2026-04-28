export function SpotPanel() {
  return (
    <div className="d-panel-body" style={{ alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200 }}>
      <div style={{ fontSize: 32 }}>🚫</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>Spot trading unavailable</div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6, maxWidth: 260 }}>
        Spot DEX is not deployed in Perp V2 testnet yet.
      </div>
    </div>
  )
}
