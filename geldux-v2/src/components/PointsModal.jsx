import { useEffect, useRef } from 'react'

const LEVELS = [
  { name: 'Rookie',  min: 0,    color: '#94a3b8' },
  { name: 'Trader',  min: 100,  color: '#3b82f6' },
  { name: 'Pro',     min: 500,  color: '#8b5cf6' },
  { name: 'Expert',  min: 1500, color: '#f59e0b' },
  { name: 'Legend',  min: 5000, color: '#ef4444' },
]

function nextLevel(pts) {
  const idx = [...LEVELS].reverse().findIndex((l) => pts >= l.min)
  const cur = LEVELS[LEVELS.length - 1 - idx]
  const nextIdx = LEVELS.indexOf(cur) + 1
  return nextIdx < LEVELS.length ? LEVELS[nextIdx] : null
}

function levelColor(name) {
  return LEVELS.find((l) => l.name === name)?.color || '#94a3b8'
}

export function PointsModal({ pts, level, pct, winRate, ptsPerTrade, trades, wins, activity, onClose }) {
  const overlayRef = useRef(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const nl = nextLevel(pts?.total || 0)
  const color = levelColor(level)
  const total = pts?.total || 0
  const streak = pts?.streak || 0

  return (
    <div className="overlay" ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose() }}>
      <div className="bottom-sheet" style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* Handle */}
        <div className="sheet-handle" />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 500, marginBottom: 4 }}>Your Points</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
              {total.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>GDX Points</div>
          </div>
          <div style={{
            padding: '6px 14px',
            borderRadius: 20,
            background: color + '18',
            border: `1.5px solid ${color}40`,
            color,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.02em',
          }}>
            {level}
          </div>
        </div>

        {/* Progress bar */}
        {nl && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{level}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{nl.name} · {nl.min.toLocaleString()} pts</span>
            </div>
            <div style={{ height: 6, background: 'var(--border-1)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: `linear-gradient(90deg, ${color}, ${nl.color})`,
                borderRadius: 3,
                transition: 'width 0.6s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5, textAlign: 'right' }}>
              {Math.round(pct)}% to next level
            </div>
          </div>
        )}

        {!nl && (
          <div style={{
            padding: '10px 16px',
            background: '#ef444410',
            border: '1.5px solid #ef444430',
            borderRadius: 10,
            marginBottom: 20,
            textAlign: 'center',
            fontSize: 13,
            color: '#ef4444',
            fontWeight: 600,
          }}>
            MAX LEVEL — Legend
          </div>
        )}

        {/* Stats grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginBottom: 20,
        }}>
          {[
            { label: 'Total Trades',  value: trades || 0 },
            { label: 'Win Rate',      value: winRate != null ? winRate.toFixed(1) + '%' : '—' },
            { label: 'Pts / Trade',   value: ptsPerTrade != null ? ptsPerTrade.toFixed(1) : '—' },
            { label: 'Win Streak',    value: streak > 0 ? `🔥 ${streak}` : '—' },
          ].map((s) => (
            <div key={s.label} style={{
              background: 'var(--bg)',
              border: '1.5px solid var(--border-1)',
              borderRadius: 12,
              padding: '12px 14px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Activity feed */}
        {activity && activity.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Recent Activity
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {activity.slice(0, 12).map((a, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: 'var(--bg)',
                  borderRadius: 8,
                  border: '1px solid var(--border-1)',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.label}</span>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: a.pts > 0 ? 'var(--long)' : 'var(--short)',
                  }}>
                    {a.pts > 0 ? '+' : ''}{a.pts} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activity && activity.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)', fontSize: 13 }}>
            No activity yet. Start trading to earn points!
          </div>
        )}

        {/* Close */}
        <button
          className="btn btn-ghost btn-block"
          style={{ marginTop: 20 }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  )
}
