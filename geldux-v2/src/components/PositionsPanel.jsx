import { useState } from 'react'
import { MARKETS } from '@/config/markets'
import { fmtUsdc, fmtPriceRaw, fmtLev, fmtAge, calcPnlUsd, fmtPnl, pnlClass, estLiqPrice } from '@/utils/format'

/* resolve symbol from position assetKey */
function symFromKey(assetKey) {
  return MARKETS.find((m) => m.key === assetKey)?.sym || '?'
}

const ORDER_TYPE_LABEL = { 0: 'Limit', 1: 'Stop-Loss', 2: 'Take-Profit' }

/* ── Close / Partial-close sheet ───────────────────────────────── */
function CloseSheet({ pos, prices, onClose, onCancel, pending }) {
  const [pct, setPct] = useState(100)
  const sym  = symFromKey(pos.assetKey)
  const mark = prices[sym]?.price || prices[sym]?.mark || pos.entryPrice
  const pnl  = calcPnlUsd(pos.entryPrice, mark, pos.isLong, pos.size)
  const est  = pnl * (pct / 100)

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            Close {pos.isLong ? 'Long' : 'Short'} {sym}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
            {fmtLev(pos.leverage)} · Size {fmtUsdc(pos.size)}
          </div>
        </div>
        <div className="sheet-body">
          <div>
            <div className="bal-row" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Close amount</span>
              <span style={{ fontWeight: 700 }}>{pct}%</span>
            </div>
            <input
              type="range" className="range" min={1} max={100} value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, var(--${pos.isLong ? 'red' : 'green'}) ${pct}%, var(--surface-3) 0%)`,
              }}
            />
            <div className="pct-btns" style={{ marginTop: 8 }}>
              {[25, 50, 75, 100].map((p) => (
                <button key={p} className="pct-btn" onClick={() => setPct(p)}>{p}%</button>
              ))}
            </div>
          </div>
          <div className="order-summary">
            <div className="order-row">
              <span className="order-key">Mark Price</span>
              <span className="order-val">{fmtPriceRaw(mark)}</span>
            </div>
            <div className="order-row">
              <span className="order-key">Est. PnL ({pct}%)</span>
              <span className={`order-val ${pnlClass(est)}`}>{fmtPnl(est)}</span>
            </div>
          </div>
          <button
            className={`btn btn-xl btn-block ${pos.isLong ? 'btn-short' : 'btn-long'}`}
            onClick={() => onClose(pos.id, pct)}
            disabled={pending}
          >
            {pending
              ? <><span className="spinner" /> Closing…</>
              : `Close ${pct < 100 ? pct + '% of ' : ''}Position`}
          </button>
          <button className="btn btn-ghost btn-block" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ── Stop-Loss / Take-Profit sheet ──────────────────────────────── */
function SlTpSheet({ pos, prices, type, onSubmit, onCancel, pending }) {
  const sym  = symFromKey(pos.assetKey)
  const mark = prices[sym]?.price || prices[sym]?.mark || pos.entryPrice
  const def  = type === 'sl'
    ? (pos.isLong ? mark * 0.95 : mark * 1.05).toFixed(2)
    : (pos.isLong ? mark * 1.10 : mark * 0.90).toFixed(2)
  const [price, setPrice] = useState(def)
  const isSl = type === 'sl'

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {isSl ? 'Stop-Loss' : 'Take-Profit'} — {sym}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
            Mark {fmtPriceRaw(mark)} · Entry {fmtPriceRaw(pos.entryPrice)}
          </div>
        </div>
        <div className="sheet-body">
          <div className="trade-section">
            <div className="trade-label">Trigger Price (USDC)</div>
            <div className="input-wrap">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <span className="input-suffix">USDC</span>
            </div>
          </div>
          <button
            className={`btn btn-xl btn-block ${isSl ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => onSubmit(pos.id, type, parseFloat(price) || 0)}
            disabled={pending || !parseFloat(price)}
          >
            {pending ? 'Submitting…' : `Set ${isSl ? 'Stop-Loss' : 'Take-Profit'}`}
          </button>
          <button className="btn btn-ghost btn-block" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ── Increase / Top-up sheet ────────────────────────────────────── */
function IncreaseSheet({ pos, onIncrease, onCancel, pending }) {
  const sym = symFromKey(pos.assetKey)
  const [amount, setAmount] = useState('')
  const amt = parseFloat(amount) || 0

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div style={{ fontWeight: 700, fontSize: 16 }}>Add Collateral — {sym}</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
            Current collateral {fmtUsdc(pos.collateral)}
          </div>
        </div>
        <div className="sheet-body">
          <div className="trade-section">
            <div className="trade-label">Additional Collateral (USDC)</div>
            <div className="input-wrap">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="input-suffix">USDC</span>
            </div>
          </div>
          {amt > 0 && (
            <div className="order-summary">
              <div className="order-row">
                <span className="order-key">New Collateral (est.)</span>
                <span className="order-val">{fmtUsdc(pos.collateral + amt)}</span>
              </div>
            </div>
          )}
          <div className="sig-notice">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            1 signature — no prior approval
          </div>
          <button
            className="btn btn-xl btn-block btn-primary"
            onClick={() => onIncrease(pos.id, amt, sym)}
            disabled={pending || amt <= 0}
          >
            {pending ? <><span className="spinner" /> Adding…</> : 'Add Collateral'}
          </button>
          <button className="btn btn-ghost btn-block" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ── Empty state ────────────────────────────────────────────────── */
function Empty({ msg }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">◎</span>
      {msg}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   DESKTOP POSITIONS PANEL
───────────────────────────────────────────────────────────────── */
export function DesktopPositionsPanel({
  positions, orders, prices, loading,
  onClose, onSlTp, onIncrease, onCancelOrder, pending,
  crossAccount,
}) {
  const [tab,   setTab]   = useState('positions')
  const [sheet, setSheet] = useState(null) /* {type, pos} */

  return (
    <div className="d-bottom desktop-only">
      {/* Tab bar */}
      <div style={{ padding: '0 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="tabs">
          <button className={`tab ${tab === 'positions' ? 'active' : ''}`} onClick={() => setTab('positions')}>
            Positions
            {positions.length > 0 && <span className="tab-count">{positions.length}</span>}
          </button>
          <button className={`tab ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>
            Orders
            {orders.length > 0 && <span className="tab-count">{orders.length}</span>}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, maxHeight: 300 }}>
        {tab === 'positions' && (
          loading
            ? <div className="loading-state"><span className="spinner" /><span>Loading positions…</span></div>
            : positions.length === 0
              ? <Empty msg="No open positions" />
              : (
                <table className="pos-table">
                  <thead>
                    <tr>
                      <th>Market</th><th>Side</th><th>Size</th><th>Collateral</th><th>Lev</th>
                      <th>Entry</th><th>Mark</th><th>PnL</th><th>Liq.</th><th>Age</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => {
                      const sym    = symFromKey(pos.assetKey)
                      const mark   = prices[sym]?.price || prices[sym]?.mark || pos.entryPrice
                      const pnl    = calcPnlUsd(pos.entryPrice, mark, pos.isLong, pos.size)
                      const liq    = estLiqPrice(pos.entryPrice, pos.leverage, pos.isLong)
                      const isCross = crossAccount?.posIds?.includes(pos.id)
                      return (
                        <tr key={pos.id}>
                          <td style={{ fontWeight: 700 }}>{sym}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <span className={`badge ${pos.isLong ? 'badge-long' : 'badge-short'}`}>
                                {pos.isLong ? '▲ Long' : '▼ Short'}
                              </span>
                              {isCross && <span className="badge badge-neutral" style={{ fontSize: 9 }}>Cross</span>}
                            </div>
                          </td>
                          <td className="mono">{fmtUsdc(pos.size)}</td>
                          <td className="mono">{fmtUsdc(pos.collateral)}</td>
                          <td className="mono">{fmtLev(pos.leverage)}</td>
                          <td className="mono">{fmtPriceRaw(pos.entryPrice)}</td>
                          <td className="mono">{fmtPriceRaw(mark)}</td>
                          <td className={`mono ${pnlClass(pnl)}`} style={{ fontWeight: 600 }}>{fmtPnl(pnl)}</td>
                          <td className="mono neg">{fmtPriceRaw(liq)}</td>
                          <td className="mono" style={{ color: 'var(--text-3)' }}>{fmtAge(pos.openTime)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-xs btn-surface" onClick={() => setSheet({ type: 'increase', pos })}>+</button>
                              <button className="btn btn-xs btn-secondary" onClick={() => setSheet({ type: 'sl', pos })}>SL</button>
                              <button className="btn btn-xs btn-secondary" onClick={() => setSheet({ type: 'tp', pos })}>TP</button>
                              <button className="btn btn-xs btn-danger" onClick={() => setSheet({ type: 'close', pos })}>Close</button>
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
            ? <Empty msg="No open orders" />
            : (
              <table className="pos-table">
                <thead>
                  <tr><th>Market</th><th>Type</th><th>Side</th><th>Trigger</th><th>Collateral</th><th>Fraction</th><th></th></tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const sym = symFromKey(o.assetKey)
                    return (
                      <tr key={o.id}>
                        <td style={{ fontWeight: 700 }}>{sym}</td>
                        <td><span className="badge badge-neutral">{ORDER_TYPE_LABEL[o.orderType] || 'Order'}</span></td>
                        <td><span className={`badge ${o.isLong ? 'badge-long' : 'badge-short'}`}>{o.isLong ? '▲ Long' : '▼ Short'}</span></td>
                        <td className="mono">{fmtPriceRaw(o.triggerPrice)}</td>
                        <td className="mono">{fmtUsdc(o.collateral)}</td>
                        <td className="mono" style={{ color: 'var(--text-3)' }}>
                          {o.fractionBps < 10000 ? (o.fractionBps / 100).toFixed(0) + '%' : '100%'}
                        </td>
                        <td>
                          <button className="btn btn-xs btn-danger" onClick={() => onCancelOrder(o.id)}>Cancel</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
        )}
      </div>

      {/* Sheets */}
      {sheet?.type === 'close' && (
        <CloseSheet
          pos={sheet.pos} prices={prices} pending={pending}
          onClose={(id, pct) => { onClose(id, pct); setSheet(null) }}
          onCancel={() => setSheet(null)}
        />
      )}
      {(sheet?.type === 'sl' || sheet?.type === 'tp') && (
        <SlTpSheet
          pos={sheet.pos} prices={prices} type={sheet.type} pending={pending}
          onSubmit={(id, t, price) => { onSlTp(id, t, price); setSheet(null) }}
          onCancel={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'increase' && (
        <IncreaseSheet
          pos={sheet.pos} pending={pending}
          onIncrease={(id, amt, sym) => { onIncrease(id, amt, sym); setSheet(null) }}
          onCancel={() => setSheet(null)}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   MOBILE POSITIONS LIST
───────────────────────────────────────────────────────────────── */
export function MobilePositionsList({ positions, orders = [], prices, loading, onClose, onSlTp, onIncrease, onCancelOrder, pending, crossAccount }) {
  const [expanded, setExpanded] = useState(null)
  const [sheet,    setSheet]    = useState(null)

  if (loading && !positions.length) {
    return <div className="loading-state"><span className="spinner" /><span>Loading positions…</span></div>
  }

  return (
    <div style={{ padding: '12px 12px 20px' }}>
      {positions.length === 0 && <Empty msg="No open positions" />}
      {positions.map((pos) => {
        const sym     = symFromKey(pos.assetKey)
        const mark    = prices[sym]?.price || prices[sym]?.mark || pos.entryPrice
        const pnl     = calcPnlUsd(pos.entryPrice, mark, pos.isLong, pos.size)
        const liq     = estLiqPrice(pos.entryPrice, pos.leverage, pos.isLong)
        const open    = expanded === pos.id
        const isCross = crossAccount?.posIds?.includes(pos.id)
        const slOrder = orders.find((o) => o.posId === pos.id && o.orderType === 1)
        const tpOrder = orders.find((o) => o.posId === pos.id && o.orderType === 2)

        return (
          <div key={pos.id} className="m-pos-card">
            <div className="m-pos-card-header" onClick={() => setExpanded(open ? null : pos.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{sym}</span>
                <span className={`badge ${pos.isLong ? 'badge-long' : 'badge-short'}`}>
                  {pos.isLong ? '▲ Long' : '▼ Short'}
                </span>
                <span className="badge badge-neutral">{fmtLev(pos.leverage)}</span>
                {isCross && <span className="badge badge-neutral" style={{ fontSize: 9 }}>Cross</span>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className={`mono ${pnlClass(pnl)}`} style={{ fontWeight: 700, fontSize: 14 }}>{fmtPnl(pnl)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtAge(pos.openTime)}</div>
              </div>
            </div>

            {open && (
              <div className="m-pos-expanded">
                {[
                  ['Size',       fmtUsdc(pos.size)],
                  ['Collateral', fmtUsdc(pos.collateral)],
                  ['Entry',      fmtPriceRaw(pos.entryPrice)],
                  ['Mark',       fmtPriceRaw(mark)],
                  ['Liq. Price', fmtPriceRaw(liq)],
                ].map(([k, v]) => (
                  <div key={k} className="m-pos-row">
                    <span style={{ color: 'var(--text-3)' }}>{k}</span>
                    <span className="mono">{v}</span>
                  </div>
                ))}
                {(slOrder || tpOrder) && (
                  <div style={{ margin: '6px 0 2px', display: 'flex', gap: 10 }}>
                    {slOrder && (
                      <div className="m-pos-row" style={{ flex: 1 }}>
                        <span style={{ color: 'var(--red)', fontSize: 11 }}>SL</span>
                        <span className="mono neg" style={{ fontSize: 12 }}>{fmtPriceRaw(slOrder.triggerPrice)}</span>
                      </div>
                    )}
                    {tpOrder && (
                      <div className="m-pos-row" style={{ flex: 1 }}>
                        <span style={{ color: 'var(--green)', fontSize: 11 }}>TP</span>
                        <span className="mono pos" style={{ fontSize: 12 }}>{fmtPriceRaw(tpOrder.triggerPrice)}</span>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginTop: 4 }}>
                  <button className="btn btn-sm btn-surface" onClick={() => setSheet({ type: 'increase', pos })}>+ Add</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => setSheet({ type: 'sl', pos })}>SL</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => setSheet({ type: 'tp', pos })}>TP</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setSheet({ type: 'close', pos })}>Close</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Sheets */}
      {sheet?.type === 'close' && (
        <CloseSheet
          pos={sheet.pos} prices={prices} pending={pending}
          onClose={(id, pct) => { onClose(id, pct); setSheet(null) }}
          onCancel={() => setSheet(null)}
        />
      )}
      {(sheet?.type === 'sl' || sheet?.type === 'tp') && (
        <SlTpSheet
          pos={sheet.pos} prices={prices} type={sheet.type} pending={pending}
          onSubmit={(id, t, price) => { onSlTp(id, t, price); setSheet(null) }}
          onCancel={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'increase' && (
        <IncreaseSheet
          pos={sheet.pos} pending={pending}
          onIncrease={(id, amt, sym) => { onIncrease(id, amt, sym); setSheet(null) }}
          onCancel={() => setSheet(null)}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   MOBILE ORDERS LIST
───────────────────────────────────────────────────────────────── */
export function MobileOrdersList({ orders, onCancelOrder, pending }) {
  if (!orders.length) return <Empty msg="No open orders" />
  return (
    <div style={{ padding: '12px 12px 20px' }}>
      {orders.map((o) => {
        const sym = symFromKey(o.assetKey)
        return (
          <div key={o.id} className="m-pos-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{sym}</span>
                  <span className={`badge ${o.isLong ? 'badge-long' : 'badge-short'}`}>
                    {o.isLong ? '▲' : '▼'} {o.isLong ? 'Long' : 'Short'}
                  </span>
                  <span className="badge badge-neutral">{ORDER_TYPE_LABEL[o.orderType]}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                  <div>
                    <span style={{ color: 'var(--text-3)' }}>Trigger </span>
                    <span className="mono">{fmtPriceRaw(o.triggerPrice)}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-3)' }}>Col </span>
                    <span className="mono">{fmtUsdc(o.collateral)}</span>
                  </div>
                </div>
              </div>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => onCancelOrder(o.id)}
                disabled={pending}
              >
                Cancel
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
