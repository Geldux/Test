import { useState } from 'react'
import { MARKETS } from '@/config/markets'
import { fmtPriceRaw } from '@/utils/format'

const TOKENS = ['USDC', 'ETH', 'BTC', 'SOL']

/* simple swap arrow icon */
function SwapArrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  )
}

/* get approx USD price for any token */
function usdPrice(sym, prices) {
  if (sym === 'USDC') return 1
  return prices[sym]?.price || prices[sym]?.mark || 0
}

export function SpotPanel({ prices, account, onConnect, isConnecting }) {
  const [fromToken, setFromToken] = useState('USDC')
  const [toToken,   setToToken]   = useState('ETH')
  const [fromAmt,   setFromAmt]   = useState('')

  const fromP  = usdPrice(fromToken, prices)
  const toP    = usdPrice(toToken, prices)
  const fromV  = parseFloat(fromAmt) || 0
  const toAmt  = toP > 0 && fromP > 0 ? ((fromV * fromP) / toP).toFixed(6) : '—'
  const rate   = toP > 0 && fromP > 0
    ? `1 ${fromToken} = ${(fromP / toP).toFixed(toToken === 'USDC' ? 2 : 6)} ${toToken}`
    : '—'

  function flip() {
    setFromToken(toToken)
    setToToken(fromToken)
    setFromAmt('')
  }

  return (
    <div className="d-panel-body" style={{ gap: 14 }}>
      {/* From token */}
      <div className="trade-section">
        <div className="trade-label">You Pay</div>
        <div style={{
          background: 'var(--surface-2)', border: '1.5px solid var(--border-2)',
          borderRadius: 'var(--r)', padding: '14px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <input
              style={{
                background: 'none', border: 'none', fontSize: 22, fontWeight: 700,
                color: 'var(--text-1)', width: '60%', outline: 'none',
                fontFamily: 'var(--font-mono)',
              }}
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={fromAmt}
              onChange={(e) => setFromAmt(e.target.value)}
            />
            <select
              style={{
                background: 'var(--surface-3)', border: '1px solid var(--border-2)',
                borderRadius: 'var(--r-sm)', padding: '6px 10px',
                color: 'var(--text-1)', fontWeight: 700, fontSize: 14,
                cursor: 'pointer',
              }}
              value={fromToken}
              onChange={(e) => setFromToken(e.target.value)}
            >
              {TOKENS.filter((t) => t !== toToken).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          {fromV > 0 && fromP > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              ≈ ${(fromV * fromP).toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {/* Flip button */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px 0' }}>
        <button
          className="btn btn-icon btn-secondary"
          onClick={flip}
          style={{ width: 36, height: 36, borderRadius: '50%' }}
          title="Flip tokens"
        >
          <SwapArrow />
        </button>
      </div>

      {/* To token */}
      <div className="trade-section">
        <div className="trade-label">You Receive</div>
        <div style={{
          background: 'var(--surface-2)', border: '1.5px solid var(--border-2)',
          borderRadius: 'var(--r)', padding: '14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{
            fontSize: 22, fontWeight: 700, color: 'var(--text-1)',
            fontFamily: 'var(--font-mono)',
          }}>
            {toAmt}
          </div>
          <select
            style={{
              background: 'var(--surface-3)', border: '1px solid var(--border-2)',
              borderRadius: 'var(--r-sm)', padding: '6px 10px',
              color: 'var(--text-1)', fontWeight: 700, fontSize: 14,
              cursor: 'pointer',
            }}
            value={toToken}
            onChange={(e) => setToToken(e.target.value)}
          >
            {TOKENS.filter((t) => t !== fromToken).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Exchange rate */}
      {fromV > 0 && (
        <div style={{
          fontSize: 12, color: 'var(--text-3)', textAlign: 'center',
          padding: '8px', background: 'var(--surface-2)',
          borderRadius: 'var(--r-sm)', fontFamily: 'var(--font-mono)',
        }}>
          {rate}
        </div>
      )}

      {/* Prices reference */}
      <div className="order-summary">
        {MARKETS.map((m) => (
          <div key={m.sym} className="order-row">
            <span className="order-key">{m.sym} Mark</span>
            <span className="order-val">{fmtPriceRaw(prices[m.sym]?.price || prices[m.sym]?.mark)}</span>
          </div>
        ))}
      </div>

      {/* Submit */}
      {account ? (
        <button className="btn btn-xl btn-block btn-primary" disabled>
          Swap — Coming Soon
        </button>
      ) : (
        <button
          className="btn btn-xl btn-block btn-primary"
          onClick={onConnect}
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
      )}

      <div style={{
        fontSize: 11, color: 'var(--text-4)', textAlign: 'center',
        padding: '6px', lineHeight: 1.5,
      }}>
        Spot swap integration in progress.
        <br />Live quotes will appear here when DEX routing is enabled.
      </div>
    </div>
  )
}
