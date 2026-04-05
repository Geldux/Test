import { useState } from 'react'
import { MARKETS } from '@/config/markets'
import { fmtUsdc, fmtPriceRaw, fmtLev, fmtAge, calcPnlUsd, fmtPnl, pnlClass, estLiqPrice } from '@/utils/format'

/* Resolve symbol from position key */
function symFromKey(key) {
  return MARKETS.find((m) => m.key === key)?.sym || '?'
}

/* Order type label */
const ORDER_TYPE_LABEL = ['Limit', 'Stop Loss', 'Take Profit']

/* ── Close position bottom sheet ─────────────────────────────────────────── */
function CloseSheet({ pos, prices, onClose, onCancel, pending }) {
  const [pct, setPct] = useState(100)
  const sym   = symFromKey(pos.key)
  const mark  = prices[sym]?.price || prices[sym]?.mark || pos.entryPrice
  const pnl   = calcPnlUsd(pos.entryPrice, mark, pos.isLong, pos.size)
  const estPnl = pnl * (pct / 100)

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
            Close {pos.isLong ? 'Long' : 'Short'} {sym}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
            {fmtLev(pos.leverage)} · Size {fmtUsdc(pos.size)}
          </div>
        </div>
        <div className="sheet-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Close % */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--text-3)' }}>Close amount</span>
              <span style={{ fontWeight: 700 }}>{pct}%</span>
            </div>
            <input
              type="range" className="range" min={1} max={100} value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              style={{ background: `linear-gradient(to right, var(--${pos.isLong ? 'long' : 'short'}) ${pct}%, var(--border-2) 0%)` }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              {[25, 50, 75, 100].map((p) => (
                <button key={p} className="pct-btn" style={{ flex: '0 0 23%' }} onClick={() => setPct(p)}>{p}%</button>
              ))}
            </div>
          </div>

          {/* PnL preview */}
          <div className="order-summary">
            <div className="order-row">
              <span className="order-key">Mark Price</span>
              <span className="order-val">{fmtPriceRaw(mark)}</span>
            </div>
            <div className="order-row">
              <span className="order-key">Est. PnL ({pct}%)</span>
              <span className={`order-val ${pnlClass(estPnl)}`}>{fmtPnl(estPnl)}</span>
            </div>
          </div>

          <button
            className={`btn btn-xl btn-block ${pos.isLong ? 'btn-short' : 'btn-long'}`}
            onClick={() => onClose(pos.id, sym, pnl)}
            disabled={pending}
          >
            {pending ? <><span className="spinner" style={{ width: 16, height: 16, borderTopColor: '#fff' }} /> Closing…</> : `Close ${pct < 100 ? pct + '% of ' : ''}Position`}
          </button>

          <button className="btn btn-ghost btn-block" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ── SL / TP sheet ───────────────────────────────────────────────────────── */
function SlTpSheet({ pos, prices, type, onSubmit, onCancel, pending }) {
  const sym   = symFromKey(pos.key)
  const mark  = prices[sym]?.price || prices[sym]?.mark || pos.entryPrice
  const [price, setPrice] = useState(type === 'sl'
    ? (pos.isLong ? mark * 0.95 : mark * 1.05).toFixed(2)
    : (pos.isLong ? mark * 1.10 : mark * 0.90).toFixed(2)
  )

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
            Set {type === 'sl' ? 'Stop-Loss' : 'Take-Profit'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
            {sym} · Mark {fmtPriceRaw(mark)}
          </div>
        </div>
        <div className="sheet-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="trade-section">
            <div className="trade-label">Trigger Price (USDC)</div>
            <div className="input-wrap">
              <input className="input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
              <span className="input-suffix">USDC</span>
            </div>
          </div>
          <button
            className={`btn btn-xl btn-block ${type === 'sl' ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => onSubmit(pos.id, parseFloat(price) || 0, type)}
            disabled={pending || !parseFloat(price)}
          >
            {pending ? 'Submitting…' : `Set ${type === 'sl' ? 'Stop-Loss' : 'Take-Profit'}`}
          </button>
          <button className="btn btn-ghost btn-block" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ── Desktop positions table ─────────────────────────────────────────────── */
export function DesktopPositionsPanel({ positions, orders, prices, onClose, onSL, onTP, onCancel, pending, className = '' }) {
  const [tab, setTab]       = useState('positions')
  const [sheet, setSheet]   = useState(null)  /* {type:'close'|'sl'|'tp', pos} */

  return (
    <div className={className}>
      <div style={{ padding: '12px 16px 0', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="tabs">
          <button className={`tab ${tab === 'positions' ? 'active' : ''}`} onClick={() => setTab('positions')}>
            Positions {positions.length > 0 && <span className="tab-count">{positions.length}</span>}
          </button>
          <button className={`tab ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>
            Orders {orders.length > 0 && <span className="tab-count">{orders.length}</span>}
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', overflowX: 'auto' }}>
        {tab === 'positions' && (
          positions.length === 0
            ? <EmptyState msg="No open positions" />
            : (
              <table className="pos-table">
                <thead>
                  <tr>
                    <th>Market</th><th>Side</th><th>Size</th><th>Leverage</th>
                    <th>Entry</th><th>Mark</th><th>PnL</th><th>Liq.</th><th>Age</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => {
                    const sym  = symFromKey(pos.key)
                    const mark = prices[sym]?.price || prices[sym]?.mark || pos.entryPrice
                    const pnl  = calcPnlUsd(pos.entryPrice, mark, pos.isLong, pos.size)
                    const liq  = estLiqPrice(pos.entryPrice, pos.leverage, pos.isLong)
                    return (
                      <tr key={pos.id}>
                        <td style={{ fontWeight: 700 }}>{sym}</td>
                        <td><span className={`badge ${pos.isLong ? 'badge-long' : 'badge-short'}`}>{pos.isLong ? '▲ Long' : '▼ Short'}</span></td>
                        <td className="mono">{fmtUsdc(pos.size)}</td>
                        <td className="mono">{fmtLev(pos.leverage)}</td>
                        <td className="mono">{fmtPriceRaw(pos.entryPrice)}</td>
                        <td className="mono">{fmtPriceRaw(mark)}</td>
                        <td className={`mono ${pnlClass(pnl)}`} style={{ fontWeight: 600 }}>{fmtPnl(pnl)}</td>
                        <td className="mono neg">{fmtPriceRaw(liq)}</td>
                        <td className="mono" style={{ color: 'var(--text-3)' }}>{fmtAge(pos.openTime)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm btn-danger" onClick={() => setSheet({ type: 'close', pos })}>Close</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => setSheet({ type: 'sl', pos })}>SL</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => setSheet({ type: 'tp', pos })}>TP</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
        )}

        {tab === 'orders' && (
          orders.length === 0
            ? <EmptyState msg="No open orders" />
            : (
              <table className="pos-table">
                <thead>
                  <tr><th>Market</th><th>Type</th><th>Side</th><th>Trigger</th><th>Collateral</th><th></th></tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const sym = symFromKey(o.key)
                    return (
                      <tr key={o.id}>
                        <td style={{ fontWeight: 700 }}>{sym}</td>
                        <td><span className="badge badge-neutral">{ORDER_TYPE_LABEL[o.orderType] || 'Order'}</span></td>
                        <td><span className={`badge ${o.isLong ? 'badge-long' : 'badge-short'}`}>{o.isLong ? '▲ Long' : '▼ Short'}</span></td>
                        <td className="mono">{fmtPriceRaw(o.triggerPrice)}</td>
                        <td className="mono">{fmtUsdc(o.collateral)}</td>
                        <td>
                          <button className="btn btn-sm btn-danger" onClick={() => onCancel(o.id)}>Cancel</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
        )}
      </div>

      {sheet?.type === 'close' && (
        <CloseSheet
          pos={sheet.pos} prices={prices}
          onClose={(id, sym, pnl) => { onClose(id, sym, pnl); setSheet(null) }}
          onCancel={() => setSheet(null)} pending={pending}
        />
      )}
      {(sheet?.type === 'sl' || sheet?.type === 'tp') && (
        <SlTpSheet
          pos={sheet.pos} prices={prices} type={sheet.type}
          onSubmit={(id, price, t) => { (t === 'sl' ? onSL : onTP)(id, price); setSheet(null) }}
          onCancel={() => setSheet(null)} pending={pending}
        />
      )}
    </div>
  )
}

/* ── Mobile positions list ───────────────────────────────────────────────── */
export function MobilePositionsList({ positions, orders, prices, onClose, onSL, onTP, onCancel, pending, activeTab }) {
  const [expanded, setExpanded]  = useState(null)
  const [sheet, setSheet]        = useState(null)

  if (activeTab === 'orders') {
    return (
      <div style={{ padding: 16 }}>
        {orders.length === 0 && <EmptyState msg="No open orders" />}
        {orders.map((o) => {
          const sym = symFromKey(o.key)
          return (
            <div key={o.id} className="m-pos-card">
              <div className="m-pos-card-header">
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{sym}</span>
                  <span className={`badge ${o.isLong ? 'badge-long' : 'badge-short'}`} style={{ marginLeft: 6 }}>{o.isLong ? '▲ Long' : '▼ Short'}</span>
                  <span className="badge badge-neutral" style={{ marginLeft: 4 }}>{ORDER_TYPE_LABEL[o.orderType]}</span>
                </div>
                <button className="btn btn-sm btn-danger" onClick={() => onCancel(o.id)}>Cancel</button>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 13 }}>
                <div><span style={{ color: 'var(--text-3)' }}>Trigger: </span><span className="mono">{fmtPriceRaw(o.triggerPrice)}</span></div>
                <div><span style={{ color: 'var(--text-3)' }}>Col: </span><span className="mono">{fmtUsdc(o.collateral)}</span></div>
              </div>
            </div>
          )
        })}
        {sheet?.type === 'close' && <CloseSheet pos={sheet.pos} prices={prices} onClose={(id, sym, pnl) => { onClose(id, sym, pnl); setSheet(null) }} onCancel={() => setSheet(null)} pending={pending} />}
      </div>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      {positions.length === 0 && <EmptyState msg="No open positions" />}
      {positions.map((pos) => {
        const sym   = symFromKey(pos.key)
        const mark  = prices[sym]?.price || prices[sym]?.mark || pos.entryPrice
        const pnl   = calcPnlUsd(pos.entryPrice, mark, pos.isLong, pos.size)
        const liq   = estLiqPrice(pos.entryPrice, pos.leverage, pos.isLong)
        const isExp = expanded === pos.id

        return (
          <div key={pos.id} className="m-pos-card">
            <div className="m-pos-card-header" onClick={() => setExpanded(isExp ? null : pos.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{sym}</span>
                <span className={`badge ${pos.isLong ? 'badge-long' : 'badge-short'}`}>{pos.isLong ? '▲ Long' : '▼ Short'}</span>
                <span className="badge badge-neutral">{fmtLev(pos.leverage)}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className={`mono ${pnlClass(pnl)}`} style={{ fontWeight: 700, fontSize: 14 }}>{fmtPnl(pnl)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtAge(pos.openTime)}</div>
              </div>
            </div>

            {isExp && (
              <div className="m-pos-expanded">
                <div className="m-pos-row"><span style={{ color: 'var(--text-3)' }}>Size</span><span className="mono">{fmtUsdc(pos.size)}</span></div>
                <div className="m-pos-row"><span style={{ color: 'var(--text-3)' }}>Entry</span><span className="mono">{fmtPriceRaw(pos.entryPrice)}</span></div>
                <div className="m-pos-row"><span style={{ color: 'var(--text-3)' }}>Mark</span><span className="mono">{fmtPriceRaw(mark)}</span></div>
                <div className="m-pos-row"><span style={{ color: 'var(--text-3)' }}>Liq. Price</span><span className="mono neg">{fmtPriceRaw(liq)}</span></div>
                <div className="m-pos-row"><span style={{ color: 'var(--text-3)' }}>Collateral</span><span className="mono">{fmtUsdc(pos.collateral)}</span></div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button className="btn btn-sm btn-danger" style={{ flex: 1 }} onClick={() => setSheet({ type: 'close', pos })}>Close</button>
                  <button className="btn btn-sm btn-secondary" style={{ flex: 1 }} onClick={() => setSheet({ type: 'sl', pos })}>Stop-Loss</button>
                  <button className="btn btn-sm btn-secondary" style={{ flex: 1 }} onClick={() => setSheet({ type: 'tp', pos })}>Take-Profit</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {sheet?.type === 'close' && (
        <CloseSheet pos={sheet.pos} prices={prices} onClose={(id, sym, pnl) => { onClose(id, sym, pnl); setSheet(null) }} onCancel={() => setSheet(null)} pending={pending} />
      )}
      {(sheet?.type === 'sl' || sheet?.type === 'tp') && (
        <SlTpSheet pos={sheet.pos} prices={prices} type={sheet.type}
          onSubmit={(id, price, t) => { (t === 'sl' ? onSL : onTP)(id, price); setSheet(null) }}
          onCancel={() => setSheet(null)} pending={pending}
        />
      )}
    </div>
  )
}

function EmptyState({ msg }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
      {msg}
    </div>
  )
}
