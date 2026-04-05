import { useState, useEffect } from 'react'
import { parseUnits } from 'ethers'
import { MARKETS, LEVERAGE_MARKS } from '@/config/markets'
import { fmtPriceRaw, fmtUsdc, estLiqPrice } from '@/utils/format'
import { Contract } from 'ethers'
import { ADDRESSES, ABI_USDC } from '@/config/contracts'
import { getReadProvider, getAccount } from '@/hooks/useWallet'

const ORDER_TYPES = ['Market', 'Limit']
const MARGIN_MODES = ['Isolated', 'Cross']

function useUsdcBalance(account) {
  const [bal, setBal] = useState(null)
  useEffect(() => {
    if (!account) { setBal(null); return }
    const rp = getReadProvider()
    if (!rp) return
    const c = new Contract(ADDRESSES.USDC, ABI_USDC, rp)
    c.balanceOf(account).then((b) => setBal(Number(b) / 1e18)).catch(() => {})
    const id = setInterval(() => {
      c.balanceOf(account).then((b) => setBal(Number(b) / 1e18)).catch(() => {})
    }, 10_000)
    return () => clearInterval(id)
  }, [account])
  return bal
}

export function TradingPanel({ sym, prices, account, onTrade, isConnecting, onConnect, pending, step }) {
  const [mode,       setMode]       = useState('Isolated')
  const [orderType,  setOrderType]  = useState('Market')
  const [side,       setSide]       = useState('long')
  const [collateral, setCollateral] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [leverage,   setLeverage]   = useState(10)

  const usdcBal  = useUsdcBalance(account)
  const market   = MARKETS.find((m) => m.sym === sym) || MARKETS[0]
  const markPrice = prices[sym]?.price || prices[sym]?.mark || 0
  const col      = parseFloat(collateral) || 0
  const size     = col * leverage
  const liqPrice = col > 0 ? estLiqPrice(markPrice, leverage, side === 'long') : null
  const fee      = size * 0.00045
  const entryP   = orderType === 'Limit' && limitPrice ? parseFloat(limitPrice) : markPrice

  function fillPct(p) {
    if (!usdcBal) return
    setCollateral((usdcBal * p / 100).toFixed(2))
  }

  function handleLevMark(v) { setLeverage(Math.min(v, market.maxLev)) }

  const canSubmit = account && col > 0 && col <= (usdcBal || 0) && !pending
  const submitLabel = !account
    ? 'Connect Wallet'
    : pending
      ? (step || 'Processing…')
      : orderType === 'Limit'
        ? `Place ${side === 'long' ? 'Long' : 'Short'} Limit`
        : `Open ${side === 'long' ? 'Long ↑' : 'Short ↓'} ${sym}`

  function handleSubmit() {
    if (!account) { onConnect(); return }
    if (!canSubmit) return
    if (orderType === 'Market') {
      onTrade({ type: 'open', sym, isLong: side === 'long', leverage, collateralUsd: col, mode })
    } else {
      onTrade({ type: 'limit', sym, isLong: side === 'long', leverage, collateralUsd: col, triggerPrice: parseFloat(limitPrice) || markPrice, mode })
    }
  }

  return (
    <div className="d-panel-body">
      {/* Margin mode */}
      <div className="trade-section">
        <div className="trade-label">Margin Mode</div>
        <div className="mode-toggle">
          {MARGIN_MODES.map((m) => (
            <button key={m} className={`mode-btn ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>{m}</button>
          ))}
        </div>
      </div>

      {/* Order type */}
      <div className="trade-section">
        <div className="mode-toggle">
          {ORDER_TYPES.map((t) => (
            <button key={t} className={`mode-btn ${orderType === t ? 'active' : ''}`} onClick={() => setOrderType(t)}>{t}</button>
          ))}
        </div>
      </div>

      {/* Long / Short */}
      <div className="side-btns">
        <button className={`side-btn long ${side === 'long' ? 'active' : ''}`} onClick={() => setSide('long')}>
          ▲ Long
        </button>
        <button className={`side-btn short ${side === 'short' ? 'active' : ''}`} onClick={() => setSide('short')}>
          ▼ Short
        </button>
      </div>

      {/* Limit price */}
      {orderType === 'Limit' && (
        <div className="trade-section">
          <div className="trade-label">Limit Price</div>
          <div className="input-wrap">
            <input
              className="input"
              type="number"
              placeholder={fmtPriceRaw(markPrice).replace('$', '')}
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
            />
            <span className="input-suffix">USDC</span>
          </div>
        </div>
      )}

      {/* Collateral */}
      <div className="trade-section">
        <div className="bal-row">
          <span className="trade-label">Collateral</span>
          <span className="bal-row">
            <span className="bal-label">Bal: </span>
            <span className="bal-value">{usdcBal != null ? usdcBal.toFixed(2) + ' USDC' : account ? '…' : '—'}</span>
          </span>
        </div>
        <div className="input-wrap">
          <input
            className="input"
            type="number"
            placeholder="0.00"
            value={collateral}
            onChange={(e) => setCollateral(e.target.value)}
          />
          <span className="input-suffix">USDC</span>
        </div>
        <div className="pct-btns">
          {[25, 50, 75, 100].map((p) => (
            <button key={p} className="pct-btn" onClick={() => fillPct(p)}>{p}%</button>
          ))}
        </div>
      </div>

      {/* Leverage */}
      <div className="trade-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="trade-label">Leverage</span>
          <span className="lev-display">{leverage}×</span>
        </div>
        <div className="range-wrap">
          <input
            type="range" className="range"
            min={1} max={market.maxLev} value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, var(--blue) ${(leverage - 1) / (market.maxLev - 1) * 100}%, var(--border-2) 0%)`,
            }}
          />
          <div className="range-marks">
            {LEVERAGE_MARKS.filter((v) => v <= market.maxLev).map((v) => (
              <span key={v} className="range-mark" onClick={() => handleLevMark(v)}>{v}×</span>
            ))}
          </div>
        </div>
      </div>

      {/* Order summary */}
      {col > 0 && (
        <div className="order-summary">
          <div className="order-row">
            <span className="order-key">Position Size</span>
            <span className="order-val">{fmtUsdc(size)}</span>
          </div>
          <div className="order-row">
            <span className="order-key">Entry Price</span>
            <span className="order-val">{fmtPriceRaw(entryP)}</span>
          </div>
          <div className="order-row">
            <span className="order-key">Liq. Price (est.)</span>
            <span className="order-val neg">{liqPrice ? fmtPriceRaw(liqPrice) : '—'}</span>
          </div>
          <div className="order-row">
            <span className="order-key">Est. Fee (~0.045%)</span>
            <span className="order-val">{fmtUsdc(fee)}</span>
          </div>
          <div className="order-row">
            <span className="order-key">Margin Mode</span>
            <span className="order-val">{mode}</span>
          </div>
        </div>
      )}

      {/* 1-sig notice */}
      <div className="sig-notice">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M8 1L15 5V11L8 15L1 11V5L8 1Z" fill="rgba(42,110,255,0.2)" stroke="#2a6eff" strokeWidth="1.2"/>
          <path d="M8 5V8.5M8 10V11" stroke="#2a6eff" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        One signature · No prior approval needed
      </div>

      {/* Submit */}
      <button
        className={`btn btn-xl btn-block ${
          !account ? 'btn-primary' :
          side === 'long' ? 'btn-long' : 'btn-short'
        }`}
        onClick={handleSubmit}
        disabled={account ? (!canSubmit || pending) : isConnecting}
      >
        {pending && <span className="spinner" style={{ width: 16, height: 16, borderTopColor: '#fff' }} />}
        {submitLabel}
      </button>
    </div>
  )
}
