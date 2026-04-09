import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import { MARKETS, LEVERAGE_MARKS } from '@/config/markets'
import { ADDRESSES, ABI_USDC } from '@/config/contracts'
import { fmtPriceRaw, fmtUsdc, estLiqPrice } from '@/utils/format'
import { getReadProvider } from '@/hooks/useWallet'

/* ── USDC balance hook ──────────────────────────────────────────── */
function useUsdcBalance(account) {
  const [bal, setBal] = useState(null)
  useEffect(() => {
    if (!account) { setBal(null); return }
    const rp = getReadProvider()
    if (!rp) return
    let cancelled = false
    const load = () => {
      new Contract(ADDRESSES.USDC, ABI_USDC, rp)
        .balanceOf(account)
        .then((b) => { if (!cancelled) setBal(Number(b) / 1e18) })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 10_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [account])
  return bal
}

const ORDER_TYPES  = ['Market', 'Limit']
const MARGIN_MODES = ['Isolated', 'Cross']

/* ── Main component ─────────────────────────────────────────────── */
export function TradingPanel({ sym, prices, account, isConnecting, onTrade, onConnect, pending, step }) {
  const [mode,       setMode]       = useState('Isolated') // Isolated | Cross
  const [orderType,  setOrderType]  = useState('Market')   // Market | Limit
  const [side,       setSide]       = useState('long')     // long | short
  const [collateral, setCollateral] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [leverage,   setLeverage]   = useState(10)

  const usdcBal   = useUsdcBalance(account)
  const market    = MARKETS.find((m) => m.sym === sym) || MARKETS[0]
  const markPrice = prices[sym]?.price || prices[sym]?.mark || 0
  const col       = parseFloat(collateral) || 0
  const lim       = parseFloat(limitPrice) || markPrice
  const size      = col * leverage
  const entryP    = orderType === 'Limit' ? lim : markPrice
  const liqPrice  = col > 0 ? estLiqPrice(entryP, leverage, side === 'long') : null
  const fee       = size * 0.00045
  const funding   = 0 // displayed as — until on-chain data available

  /* fill collateral from balance pct */
  function fillPct(p) {
    if (!usdcBal) return
    setCollateral((usdcBal * p / 100).toFixed(2))
  }

  function clampLev(v) { setLeverage(Math.min(v, market.maxLev)) }

  const hasBalance = usdcBal != null && col > 0 && col <= usdcBal
  const canSubmit  = account && hasBalance && !pending
  const isLong     = side === 'long'

  const submitLabel = !account
    ? 'Connect Wallet'
    : pending
      ? (step || 'Processing…')
      : orderType === 'Limit'
        ? `Place ${isLong ? 'Long' : 'Short'} Limit`
        : `${isLong ? 'Long' : 'Short'} ${sym}`

  function handleSubmit() {
    if (!account) { onConnect?.(); return }
    if (!canSubmit) return
    const payload = { sym, isLong, leverage, collateralUsd: col, mode }
    if (orderType === 'Limit') {
      onTrade({ type: 'limit', ...payload, triggerPrice: lim })
    } else {
      onTrade({ type: 'open', ...payload })
    }
  }

  /* leverage slider fill % */
  const levFill = ((leverage - 1) / (market.maxLev - 1) * 100).toFixed(1)

  return (
    <div className="d-panel-body" style={{ gap: 14 }}>

      {/* ── Margin Mode ─────────────────────────────────────── */}
      <div className="trade-section">
        <div className="trade-label">Margin Mode</div>
        <div className="mode-toggle">
          {MARGIN_MODES.map((m) => (
            <button key={m} className={`mode-btn ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* ── Order Type ──────────────────────────────────────── */}
      <div className="trade-section">
        <div className="mode-toggle">
          {ORDER_TYPES.map((t) => (
            <button key={t} className={`mode-btn ${orderType === t ? 'active' : ''}`} onClick={() => setOrderType(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Long / Short ────────────────────────────────────── */}
      <div className="side-btns">
        <button className={`side-btn long ${isLong ? 'active' : ''}`} onClick={() => setSide('long')}>
          ▲ Long
        </button>
        <button className={`side-btn short ${!isLong ? 'active' : ''}`} onClick={() => setSide('short')}>
          ▼ Short
        </button>
      </div>

      {/* ── Limit Price (Limit only) ─────────────────────────── */}
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

      {/* ── Collateral ──────────────────────────────────────── */}
      <div className="trade-section">
        <div className="bal-row">
          <span className="trade-label">Collateral</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="bal-label">Bal:</span>
            <span className="bal-value">
              {usdcBal != null ? usdcBal.toFixed(2) + ' USDC' : account ? '…' : '—'}
            </span>
          </span>
        </div>
        <div className="input-wrap">
          <input
            className="input"
            type="number"
            inputMode="decimal"
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

      {/* ── Leverage ────────────────────────────────────────── */}
      <div className="trade-section">
        <div className="bal-row">
          <span className="trade-label">Leverage</span>
          <span className="lev-display">{leverage}×</span>
        </div>
        <div className="range-wrap">
          <input
            type="range" className="range"
            min={1} max={market.maxLev} value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, var(--${isLong ? 'green' : 'red'}) ${levFill}%, var(--surface-3) 0%)`,
            }}
          />
          <div className="range-marks">
            {LEVERAGE_MARKS.filter((v) => v <= market.maxLev).map((v) => (
              <span key={v} className="range-mark" onClick={() => clampLev(v)}>{v}×</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Order summary ───────────────────────────────────── */}
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
            <span className="order-key">Fee (~0.045%)</span>
            <span className="order-val">{fmtUsdc(fee)}</span>
          </div>
          <div className="order-row">
            <span className="order-key">Mode</span>
            <span className="order-val">{mode}</span>
          </div>
        </div>
      )}

      {/* ── 1-sig notice ────────────────────────────────────── */}
      <div className="sig-notice">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        1 signature · No prior approval needed
      </div>

      {/* ── Submit ──────────────────────────────────────────── */}
      <button
        className={`btn btn-xl btn-block ${
          !account ? 'btn-primary' : isLong ? 'btn-long' : 'btn-short'
        }`}
        onClick={handleSubmit}
        disabled={account ? (!canSubmit || pending) : isConnecting}
      >
        {pending && <span className="spinner" style={{ borderTopColor: isLong ? '#000' : '#fff' }} />}
        {submitLabel}
      </button>

      {/* collateral too high warning */}
      {account && usdcBal != null && col > usdcBal && col > 0 && (
        <div style={{ fontSize: 12, color: 'var(--red)', textAlign: 'center', marginTop: -6 }}>
          Insufficient USDC balance
        </div>
      )}
    </div>
  )
}
