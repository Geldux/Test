import { useState } from 'react'
import { fmtUsdc } from '@/utils/format'

/* ── Cross-margin account management panel ──────────────────────── */
export function AccountPanel({ crossAccount, onDeposit, onWithdraw, pending, account }) {
  const [depositAmt,  setDepositAmt]  = useState('')
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [mode, setMode] = useState('deposit') // deposit | withdraw

  const bal        = crossAccount?.balance   ?? null
  const equity     = crossAccount?.equity    ?? null
  const marginUsed = crossAccount?.marginUsed ?? null
  const freeMargin = crossAccount?.freeMargin ?? null
  const marginRatio = equity != null && marginUsed != null && equity > 0
    ? (marginUsed / equity * 100).toFixed(1)
    : null

  /* health color */
  const healthColor = !marginRatio ? 'var(--text-3)'
    : Number(marginRatio) > 80 ? 'var(--red)'
    : Number(marginRatio) > 60 ? 'var(--orange)'
    : 'var(--green)'

  function submit() {
    const amt = parseFloat(mode === 'deposit' ? depositAmt : withdrawAmt)
    if (!amt || amt <= 0) return
    if (mode === 'deposit') {
      onDeposit(amt)
      setDepositAmt('')
    } else {
      onWithdraw(amt)
      setWithdrawAmt('')
    }
  }

  if (!account) {
    return (
      <div className="empty-state" style={{ padding: '32px 16px' }}>
        <span className="empty-icon">◎</span>
        Connect wallet to view cross-margin account
      </div>
    )
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Account stats */}
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 'var(--r)', padding: '16px',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
      }}>
        {[
          { label: 'Balance',     value: bal        != null ? fmtUsdc(bal)        : '—' },
          { label: 'Equity',      value: equity     != null ? fmtUsdc(equity)     : '—' },
          { label: 'Margin Used', value: marginUsed != null ? fmtUsdc(marginUsed) : '—' },
          { label: 'Free Margin', value: freeMargin != null ? fmtUsdc(freeMargin) : '—' },
        ].map((s) => (
          <div key={s.label}>
            <div className="stat-label" style={{ marginBottom: 4 }}>{s.label}</div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Margin health bar */}
      {marginRatio != null && (
        <div>
          <div className="bal-row" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Margin Usage</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: healthColor }}>{marginRatio}%</span>
          </div>
          <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, Number(marginRatio))}%`,
              background: healthColor,
              borderRadius: 99,
              transition: 'width 0.4s',
            }} />
          </div>
          {Number(marginRatio) > 75 && (
            <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 5 }}>
              ⚠ High margin usage — consider adding collateral
            </div>
          )}
        </div>
      )}

      {/* Deposit / Withdraw toggle */}
      <div className="mode-toggle">
        <button className={`mode-btn ${mode === 'deposit' ? 'active' : ''}`} onClick={() => setMode('deposit')}>
          Deposit
        </button>
        <button className={`mode-btn ${mode === 'withdraw' ? 'active' : ''}`} onClick={() => setMode('withdraw')}>
          Withdraw
        </button>
      </div>

      {/* Amount input */}
      <div className="trade-section">
        <div className="trade-label">Amount (USDC)</div>
        <div className="input-wrap">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={mode === 'deposit' ? depositAmt : withdrawAmt}
            onChange={(e) =>
              mode === 'deposit'
                ? setDepositAmt(e.target.value)
                : setWithdrawAmt(e.target.value)
            }
          />
          <span className="input-suffix">USDC</span>
        </div>
      </div>

      {mode === 'deposit' && (
        <div className="sig-notice">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          1 signature — permit-based, no approval tx
        </div>
      )}

      <button
        className={`btn btn-xl btn-block ${mode === 'deposit' ? 'btn-primary' : 'btn-secondary'}`}
        onClick={submit}
        disabled={pending || !(parseFloat(mode === 'deposit' ? depositAmt : withdrawAmt) > 0)}
      >
        {pending
          ? <><span className="spinner" /> {mode === 'deposit' ? 'Depositing…' : 'Withdrawing…'}</>
          : mode === 'deposit' ? 'Deposit to Cross Margin' : 'Withdraw from Cross Margin'}
      </button>
    </div>
  )
}
