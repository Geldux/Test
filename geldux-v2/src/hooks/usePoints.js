import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'geldux_points_v2'

const LEVELS = [
  { name: 'Rookie',  min: 0,    color: '#94a3b8' },
  { name: 'Trader',  min: 100,  color: '#3b82f6' },
  { name: 'Pro',     min: 500,  color: '#8b5cf6' },
  { name: 'Expert',  min: 1500, color: '#f59e0b' },
  { name: 'Legend',  min: 5000, color: '#ef4444' },
]

function getLevel(pts) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (pts >= LEVELS[i].min) return { ...LEVELS[i], index: i, next: LEVELS[i + 1] || null }
  }
  return { ...LEVELS[0], index: 0, next: LEVELS[1] }
}

function load() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? JSON.parse(s) : null
  } catch (_) { return null }
}

function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch (_) {}
}

const INITIAL = {
  total: 0, trades: 0, wins: 0, activity: [],
  openTimes: {},   /* posId → timestamp */
  recentTs: [],    /* timestamps of recent trades for burst detection */
}

export function usePoints() {
  const [state, setState] = useState(() => load() || INITIAL)

  const update = useCallback((fn) => {
    setState((prev) => {
      const next = fn({ ...prev, openTimes: { ...prev.openTimes }, recentTs: [...prev.recentTs] })
      save(next)
      return next
    })
  }, [])

  /* Called when a position opens */
  const onOpen = useCallback((posId, sym, collateral) => {
    const now = Date.now()
    update((s) => {
      const burstWindow = now - 120_000
      const recent = s.recentTs.filter((t) => t > burstWindow)
      const burst  = recent.length >= 5
      const pts    = burst ? 5 : 10
      const entry  = { ts: now, text: `Opened ${sym} +${pts} pts`, pts }
      return {
        ...s,
        total:     s.total + pts,
        trades:    s.trades + 1,
        activity:  [entry, ...s.activity].slice(0, 50),
        openTimes: { ...s.openTimes, [posId]: now },
        recentTs:  [...recent, now],
      }
    })
  }, [update])

  /* Called when a position closes */
  const onClose = useCallback((posId, sym, pnl) => {
    const now = Date.now()
    update((s) => {
      const openTime  = s.openTimes[posId] || now
      const heldMs    = now - openTime
      const roundtrip = heldMs < 60_000
      const shortHold = heldMs < 30_000

      const burstWindow = now - 120_000
      const recent = s.recentTs.filter((t) => t > burstWindow)
      const burst  = recent.length >= 5

      let pts = 5
      let reason = ''
      if (roundtrip) { pts = 0;   reason = '⚡ Quick round-trip — no points' }
      else if (shortHold) { pts = Math.max(1, Math.round(pts * 0.3)); reason = '⏱ Short hold — partial points' }
      if (burst && pts > 0) { pts = Math.round(pts * 0.5); reason = '🔥 High frequency — reduced points' }
      if (pnl > 0 && !roundtrip) pts += 5  /* profitable bonus */

      const win   = pnl > 0
      const entry = { ts: now, text: pts > 0 ? `Closed ${sym} +${pts} pts${reason ? ' · ' + reason : ''}` : `Closed ${sym} ${reason}`, pts }
      const { [posId]: _, ...remainingTimes } = s.openTimes

      return {
        ...s,
        total:     s.total + pts,
        trades:    s.trades + 1,
        wins:      s.wins + (win ? 1 : 0),
        activity:  [entry, ...s.activity].slice(0, 50),
        openTimes: remainingTimes,
        recentTs:  [...recent, now],
      }
    })
  }, [update])

  /* Called when SL/TP is set */
  const onSlTpSet = useCallback((sym, type) => {
    const now = Date.now()
    update((s) => {
      const entry = { ts: now, text: `Set ${type} on ${sym} +3 pts`, pts: 3 }
      return { ...s, total: s.total + 3, activity: [entry, ...s.activity].slice(0, 50) }
    })
  }, [update])

  const pts    = state.total
  const level  = getLevel(pts)
  const pct    = level.next
    ? Math.min(100, Math.round((pts - level.min) / (level.next.min - level.min) * 100))
    : 100
  const winRate = state.trades > 0 ? Math.round(state.wins / state.trades * 100) : 0
  const ptsPerTrade = state.trades > 0 ? Math.round(state.total / state.trades) : 0

  return {
    pts, level, pct, winRate, ptsPerTrade,
    trades:   state.trades,
    wins:     state.wins,
    activity: state.activity,
    onOpen, onClose, onSlTpSet,
  }
}
