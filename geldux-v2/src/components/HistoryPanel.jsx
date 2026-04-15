import { useState } from 'react'
import { fmtUsdc, fmtPnl, pnlClass } from '@/utils/format'
import { BASESCAN_TX } from '@/hooks/useHistory'

/* ── Helpers ─────────────────────────────────────────────────────── */
function relTime(ts) {
  if (!ts) return '—'
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 0)     return 'just now'
  if (s < 60)    return s + 's ago'
  if (s < 3600)  return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}

/* ── Type configuration ──────────────────────────────────────────── */
const TYPE_META = {
  open:            { label: 'Opened',       badgeCls: 'badge-long',    dir: true  },
  close:           { label: 'Closed',       badgeCls: 'badge-short',   dir: true  },
  cross_open:      { label: 'Cross Open',   badgeCls: 'badge-long',    dir: false },
  cross_increase:  { label: 'Cross Add',    badgeCls: 'badge-long',    dir: false },
  cross_close:     { label: 'Cross Close',  badgeCls: 'badge-short',   dir: false },
  deposit:         { label: 'Deposit',      badgeCls: 'badge-neutral', dir: false },
  withdraw:        { label: 'Withdraw',     badgeCls: 'badge-neutral', dir: false },
  order_created:   { label: 'Order',        badgeCls: 'badge-neutral', dir: false },
  order_cancelled: { label: 'Cancelled',    badgeCls: 'badge-neutral', dir: false },
}

function entryDescription(e) {
  const dir = e.isLong === true ? 'Long' : e.isLong === false ? 'Short' : ''
  switch (e.type) {
    case 'open':            return `${dir} ${e.sym}${e.leverage ? ` · ${e.leverage}×` : ''}`
    case 'close':           return `${dir} ${e.sym}${e.leverage ? ` · ${e.leverage}×` : ''}`
    case 'cross_open':      return `${e.sym} (cross)`
    case 'cross_increase':  return `${e.sym || '?'} (cross add)`
    case 'cross_close':     return `${e.sym} (cross)`
    case 'deposit':         return 'Cross Deposit'
    case 'withdraw':        return 'Cross Withdrawal'
    case 'order_created':   return `${e.label ?? 'Order'} placed`
    case 'order_cancelled': return `${e.label ?? 'Order'} cancelled`
    default:                return e.type
  }
}

function entryRightValue(e) {
  if (e.type === 'close' && e.pnl != null)
    return { value: fmtPnl(e.pnl), cls: pnlClass(e.pnl) }
  if (e.type === 'open' && e.size != null)
    return { value: fmtUsdc(e.size), cls: '' }
  if ((e.type === 'cross_close' || e.type === 'cross_increase') && e.amount != null)
    return { value: fmtUsdc(e.amount), cls: '' }
  if ((e.type === 'deposit' || e.type === 'withdraw') && e.amount != null)
    return { value: fmtUsdc(e.amount), cls: '' }
  return { value: '—', cls: '' }
}

/* Filter tabs */
const FILTERS = ['All', 'Trades', 'Deposits', 'Orders']

function matchesFilter(type, filter) {
  if (filter === 'All')      return true
  if (filter === 'Trades')   return ['open', 'close', 'cross_open', 'cross_increase', 'cross_close'].includes(type)
  if (filter === 'Deposits') return ['deposit', 'withdraw'].includes(type)
  if (filter === 'Orders')   return ['order_created', 'order_cancelled'].includes(type)
  return false
}

/* ── Single entry card ───────────────────────────────────────────── */
function EntryRow({ entry }) {
  const meta  = TYPE_META[entry.type] ?? { label: entry.type, badgeCls: 'badge-neutral' }
  const right = entryRightValue(entry)

  return (
    <div style={{
      padding: '12px 0',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge ${meta.badgeCls}`} style={{ fontSize: 10, padding: '2px 7px' }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            {entryDescription(entry)}
          </span>
        </div>
        <span className={`mono ${right.cls}`} style={{ fontSize: 13, fontWeight: 700 }}>
          {right.value}
        </span>
      </div>

      {/* Bottom row — collateral detail + time + tx link */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-3)' }}>
          {entry.type === 'open' && entry.collateral != null && (
            <span>Col: {fmtUsdc(entry.collateral)}</span>
          )}
          {entry.type === 'close' && entry.collateral != null && (
            <span>Col: {fmtUsdc(entry.collateral)}</span>
          )}
          <span>{relTime(entry.ts)}</span>
        </div>
        <a
          href={BASESCAN_TX + entry.hash}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 11, color: 'var(--blue)', fontFamily: 'var(--font-mono)',
            textDecoration: 'none',
          }}
        >
          {entry.hash.slice(0, 8)}…↗
        </a>
      </div>
    </div>
  )
}

/* ── Empty state ─────────────────────────────────────────────────── */
function EmptyState({ connected, loading }) {
  if (!connected) {
    return (
      <div className="empty-state" style={{ padding: '40px 16px' }}>
        <span className="empty-icon">◎</span>
        Connect wallet to view history
      </div>
    )
  }
  if (loading) {
    return (
      <div className="empty-state" style={{ padding: '40px 16px' }}>
        <span className="spinner" />
        <span style={{ marginTop: 12, color: 'var(--text-3)' }}>Loading history…</span>
      </div>
    )
  }
  return (
    <div className="empty-state" style={{ padding: '40px 16px' }}>
      <span className="empty-icon">◎</span>
      No history in the last ~11 days
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────────── */
export function HistoryPanel({ entries, loading, account, reload }) {
  const [filter, setFilter] = useState('All')

  const visible = entries.filter((e) => matchesFilter(e.type, filter))

  return (
    <div>
      {/* Filter tabs + reload */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 0', borderBottom: '1px solid var(--border)', marginBottom: 0,
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '5px 12px', borderRadius: 'var(--r-sm)',
                border: '1px solid',
                borderColor: filter === f ? 'var(--green)' : 'var(--border-2)',
                background: filter === f ? 'var(--green-dim)' : 'transparent',
                color: filter === f ? 'var(--green)' : 'var(--text-3)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 11 }}
        >
          {loading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '↻ Refresh'}
        </button>
      </div>

      {/* Entry list */}
      <div>
        {(!account || (!loading && entries.length === 0)) ? (
          <EmptyState connected={!!account} loading={loading} />
        ) : loading && entries.length === 0 ? (
          <EmptyState connected={!!account} loading={loading} />
        ) : visible.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 16px' }}>
            No {filter.toLowerCase()} activity found
          </div>
        ) : (
          visible.map((e, i) => <EntryRow key={e.hash + i} entry={e} />)
        )}
      </div>
    </div>
  )
}
