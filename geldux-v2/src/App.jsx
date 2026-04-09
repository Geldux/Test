import { useState, useCallback } from 'react'
import { useTheme }     from '@/hooks/useTheme'
import { useWallet }    from '@/hooks/useWallet'
import { usePrices }    from '@/hooks/usePrices'
import { usePositions } from '@/hooks/usePositions'
import { useTrading }   from '@/hooks/useTrading'
import { usePoints }    from '@/hooks/usePoints'
import { useVaultStats } from '@/hooks/useVaultStats'
import { fmtUsdc, fmtUsdcCompact } from '@/utils/format'
import { MARKETS } from '@/config/markets'

import { toast }           from '@/components/Toast'
import { DesktopHeader, MobileHeader } from '@/components/Header'
import { DesktopMarketBar, MobileMarketChips } from '@/components/MarketBar'
import { DesktopMarketStats, OICard, MobileMarketStats } from '@/components/MarketStats'
import { TradingPanel }    from '@/components/TradingPanel'
import { SpotPanel }       from '@/components/SpotPanel'
import { AccountPanel }    from '@/components/AccountPanel'
import { DesktopPositionsPanel, MobilePositionsList, MobileOrdersList } from '@/components/PositionsPanel'
import { MobileNav }       from '@/components/MobileNav'
import { PointsModal }     from '@/components/PointsModal'

/* ── helpers ────────────────────────────────────────────────────── */
function th(h) { return h ? h.slice(0, 10) + '…' : '' }

/* ═══════════════════════════════════════════════════════════════════
   App
═══════════════════════════════════════════════════════════════════ */
export default function App() {
  /* ── theme ────────────────────────────────────────────────────── */
  const { isDark, toggle: toggleTheme } = useTheme()

  /* ── wallet ───────────────────────────────────────────────────── */
  const { account, isConnecting, chainOk, connect, disconnect } = useWallet()

  /* ── data ─────────────────────────────────────────────────────── */
  const { prices, oi, funding }                            = usePrices()
  const { positions, orders, crossAccount, loading, refresh } = usePositions(account)
  const { stats: vaultStats }                              = useVaultStats()

  /* vault summary */
  const vault = vaultStats ? {
    tvlFmt:  '$' + fmtUsdcCompact(vaultStats.freeBalance + vaultStats.reservedCollateral),
    utilFmt: ((vaultStats.reservedCollateral / ((vaultStats.freeBalance + vaultStats.reservedCollateral) || 1)) * 100).toFixed(1) + '%',
  } : null

  /* ── trading actions ─────────────────────────────────────────── */
  const {
    pending, step,
    openPosition, increasePosition, closePosition, partialClosePosition,
    createLimitOrder, createStopLoss, createTakeProfit, cancelOrder,
    crossDeposit, crossWithdraw, crossOpenPosition, crossClosePosition,
    claimFaucet,
  } = useTrading()

  /* ── points ───────────────────────────────────────────────────── */
  const pts = usePoints()

  /* ── UI state ─────────────────────────────────────────────────── */
  const [page,      setPage]      = useState('trade')    // trade | spot | portfolio | rewards
  const [sym,       setSym]       = useState(MARKETS[0].sym)
  const [mobileTab, setMobileTab] = useState('trade')    // trade | positions | orders | portfolio
  const [showPts,   setShowPts]   = useState(false)

  /* ── trade handler ───────────────────────────────────────────── */
  const handleTrade = useCallback(async ({ type, sym: s, isLong, leverage, collateralUsd, triggerPrice, mode }) => {
    try {
      if (type === 'open') {
        const isCross = mode === 'Cross'
        const { hash } = isCross
          ? await crossOpenPosition({ sym: s, isLong, leverage, collateralUsd })
          : await openPosition({ sym: s, isLong, leverage, collateralUsd })
        toast.success(`Opened ${isCross ? 'Cross ' : ''}${isLong ? 'Long' : 'Short'} ${s} · ${th(hash)}`)
        pts.onOpen(hash, s, collateralUsd)
        setTimeout(refresh, 3000)
      } else if (type === 'limit') {
        const { hash } = await createLimitOrder({ sym: s, isLong, leverage, collateralUsd, triggerPrice })
        toast.success(`Limit order placed · ${th(hash)}`)
        setTimeout(refresh, 3000)
      }
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Transaction failed')
    }
  }, [openPosition, crossOpenPosition, createLimitOrder, pts, refresh])

  /* ── close handler ───────────────────────────────────────────── */
  const handleClose = useCallback(async (posId, pct = 100) => {
    const pos = positions.find((p) => p.id === posId)
    const isCrossPos = crossAccount?.posIds?.includes(posId)
    try {
      let hash
      if (isCrossPos) {
        /* cross-margin close — fractionBps: 10000 = full, else partial */
        const fractionBps = Math.round(pct * 100)
        ;({ hash } = await crossClosePosition({ posId, fractionBps }))
      } else if (pct < 100 && pos?.collateral) {
        /* partial close — reduce collateral by requested % */
        const collateralDelta = pos.collateral * pct / 100
        ;({ hash } = await partialClosePosition({ posId, collateralDelta }))
      } else {
        /* full isolated close */
        ;({ hash } = await closePosition({ posId, sym: pos?.sym || 'BTC' }))
      }
      toast.success(`${pct < 100 ? `Partially closed (${pct}%)` : 'Closed'} ${pos?.sym || 'position'} · ${th(hash)}`)
      if (pos) pts.onClose(posId, pos.sym, 0)
      setTimeout(refresh, 3000)
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Close failed')
    }
  }, [closePosition, partialClosePosition, crossClosePosition, crossAccount, positions, pts, refresh])

  /* ── SL/TP handler ───────────────────────────────────────────── */
  const handleSlTp = useCallback(async (posId, type, price) => {
    try {
      if (type === 'sl') {
        await createStopLoss({ posId, triggerPrice: price })
        toast.success('Stop-loss set')
      } else {
        await createTakeProfit({ posId, triggerPrice: price })
        toast.success('Take-profit set')
      }
      pts.onSlTpSet(posId, type)
      setTimeout(refresh, 2000)
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Failed')
    }
  }, [createStopLoss, createTakeProfit, pts, refresh])

  /* ── increase handler ────────────────────────────────────────── */
  const handleIncrease = useCallback(async (posId, collateralUsd, sym) => {
    try {
      const { hash } = await increasePosition({ posId, sym: sym || 'BTC', collateralUsd })
      toast.success(`Position increased · ${th(hash)}`)
      setTimeout(refresh, 3000)
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Increase failed')
    }
  }, [increasePosition, refresh])

  /* ── cancel order ────────────────────────────────────────────── */
  const handleCancelOrder = useCallback(async (orderId) => {
    try {
      await cancelOrder({ orderId })
      toast.success('Order cancelled')
      setTimeout(refresh, 2000)
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Cancel failed')
    }
  }, [cancelOrder, refresh])

  /* ── cross margin ────────────────────────────────────────────── */
  const handleCrossDeposit = useCallback(async (amountUsd) => {
    try {
      const { hash } = await crossDeposit({ amountUsd })
      toast.success(`Deposited to cross margin · ${th(hash)}`)
      setTimeout(refresh, 3000)
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Deposit failed')
    }
  }, [crossDeposit, refresh])

  const handleCrossWithdraw = useCallback(async (amountUsd) => {
    try {
      const { hash } = await crossWithdraw({ amountUsd })
      toast.success(`Withdrawn from cross margin · ${th(hash)}`)
      setTimeout(refresh, 3000)
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Withdraw failed')
    }
  }, [crossWithdraw, refresh])

  /* ── faucet ──────────────────────────────────────────────────── */
  const handleFaucet = useCallback(async () => {
    try {
      const { hash } = await claimFaucet()
      toast.success(`Testnet USDC claimed · ${th(hash)}`)
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Faucet failed')
    }
  }, [claimFaucet])

  /* ── counts ──────────────────────────────────────────────────── */
  const posCount   = positions.length
  const orderCount = orders.length

  /* ── shared header props ─────────────────────────────────────── */
  const headerProps = {
    account, isConnecting, chainOk,
    pts: pts.pts, level: pts.level,
    connect, disconnect,
    onPointsClick: () => setShowPts(true),
    isDark, onToggleTheme: toggleTheme,
  }

  /* ── right panel content (perp or spot) ──────────────────────── */
  const rightPanel = (
    <aside className="d-panel desktop-only">
      <div className="d-panel-header">
        <div className="mode-toggle" style={{ flex: 1 }}>
          <button className={`mode-btn ${page === 'trade' ? 'active' : ''}`} onClick={() => setPage('trade')}>
            Perp
          </button>
          <button className={`mode-btn ${page === 'spot' ? 'active' : ''}`} onClick={() => setPage('spot')}>
            Spot
          </button>
        </div>
      </div>

      {page === 'spot' ? (
        <SpotPanel prices={prices} account={account} onConnect={connect} isConnecting={isConnecting} />
      ) : (
        <>
          <TradingPanel
            sym={sym} prices={prices} account={account}
            isConnecting={isConnecting} onTrade={handleTrade}
            onConnect={connect} pending={pending} step={step}
          />
          <div style={{ padding: '0 14px 14px' }}>
            <OICard sym={sym} oi={oi} />
            {vault && (
              <div className="card card-sm" style={{ marginTop: 12 }}>
                <div className="trade-label" style={{ marginBottom: 8 }}>Vault</div>
                {[['TVL', vault.tvlFmt], ['Utilization', vault.utilFmt]].map(([k, v]) => (
                  <div key={k} className="order-row">
                    <span className="order-key">{k}</span>
                    <span className="order-val">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  )

  /* ──────────────────────────────────────────────────────────────
     DESKTOP LAYOUT
  ────────────────────────────────────────────────────────────── */
  const desktopLayout = (
    <div className="desktop-only" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <DesktopHeader {...headerProps} page={page} onPageChange={setPage} />

      {(page === 'trade' || page === 'spot') && (
        <div className="d-body">
          <DesktopMarketBar prices={prices} oi={oi} funding={funding} selected={sym} onSelect={setSym} />

          <main className="d-center">
            <DesktopMarketStats sym={sym} prices={prices} oi={oi} funding={funding} />

            {/* Chart area */}
            <div className="chart-area">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <span>Chart integration coming soon</span>
            </div>

            {/* Bottom positions panel */}
            <DesktopPositionsPanel
              positions={positions} orders={orders} prices={prices}
              loading={loading} pending={pending}
              onClose={handleClose} onSlTp={handleSlTp}
              onIncrease={handleIncrease} onCancelOrder={handleCancelOrder}
            />
          </main>

          {rightPanel}
        </div>
      )}

      {page === 'portfolio' && (
        <div style={{ marginTop: 'var(--header-h)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, height: 'calc(100vh - var(--header-h))', overflow: 'auto' }}>
          <div style={{ padding: 24, borderRight: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Cross Margin Account</h2>
            <AccountPanel
              crossAccount={crossAccount} account={account}
              onDeposit={handleCrossDeposit} onWithdraw={handleCrossWithdraw}
              pending={pending}
            />
          </div>
          <div style={{ padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Vault</h2>
            {vault && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['TVL',         vault.tvlFmt],
                  ['Utilization', vault.utilFmt],
                  ['APY (est.)',  '—'],
                ].map(([k, v]) => (
                  <div key={k} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'var(--surface)',
                    border: '1px solid var(--border)', borderRadius: 'var(--r)',
                  }}>
                    <span style={{ color: 'var(--text-3)' }}>{k}</span>
                    <span className="mono" style={{ fontWeight: 700 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 16px' }}>Testnet Tools</h2>
            <button
              className="btn btn-outline btn-lg btn-block"
              onClick={handleFaucet}
              disabled={pending || !account}
            >
              {pending ? <><span className="spinner" /> Claiming…</> : 'Claim Testnet USDC'}
            </button>
            {!account && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, textAlign: 'center' }}>
                Connect wallet to claim
              </div>
            )}
          </div>
        </div>
      )}

      {page === 'rewards' && (
        <div style={{ marginTop: 'var(--header-h)', padding: 32, maxWidth: 600, margin: 'var(--header-h) auto 0' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>GDX Points</h2>
          <p style={{ color: 'var(--text-3)', marginBottom: 24 }}>
            Earn points by trading. Open positions, set stop-losses, and win trades to level up.
          </p>

          {/* Level card */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)', padding: 24, marginBottom: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Total Points</div>
                <div className="mono" style={{ fontSize: 36, fontWeight: 800, color: 'var(--text-1)' }}>
                  {(pts.pts || 0).toLocaleString()}
                </div>
              </div>
              <div style={{
                padding: '6px 16px', borderRadius: 99,
                background: 'var(--green-dim)', color: 'var(--green)',
                fontWeight: 700, fontSize: 14,
              }}>
                {pts.level?.name}
              </div>
            </div>
            <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pts.pct}%`,
                background: 'var(--green)', borderRadius: 99,
                transition: 'width 0.6s ease',
              }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              {Math.round(pts.pct)}% to next level
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { label: 'Trades',      value: pts.trades    || 0 },
              { label: 'Win Rate',    value: pts.winRate != null ? pts.winRate + '%' : '—' },
              { label: 'Pts / Trade', value: pts.ptsPerTrade != null ? pts.ptsPerTrade : '—' },
            ].map((s) => (
              <div key={s.label} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--r)', padding: '14px 16px',
              }}>
                <div className="stat-label" style={{ marginBottom: 6 }}>{s.label}</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  /* ──────────────────────────────────────────────────────────────
     MOBILE LAYOUT
  ────────────────────────────────────────────────────────────── */
  const mobileLayout = (
    <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <MobileHeader {...headerProps} />

      <MobileMarketChips
        prices={prices}
        selected={sym}
        onSelect={(s) => { setSym(s); setMobileTab('trade') }}
      />

      <div className="m-content">
        {/* ── Trade tab ── */}
        {mobileTab === 'trade' && (
          <>
            <MobileMarketStats sym={sym} prices={prices} oi={oi} funding={funding} />

            {/* Chart placeholder */}
            <div style={{
              margin: '0 12px 12px', height: 140,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--r)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 6, color: 'var(--text-4)', fontSize: 12,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Chart coming soon
            </div>

            {/* Perp / Spot tabs */}
            <div style={{ margin: '0 12px 10px' }}>
              <div className="mode-toggle">
                <button className={`mode-btn ${page !== 'spot' ? 'active' : ''}`} onClick={() => setPage('trade')}>
                  Perpetuals
                </button>
                <button className={`mode-btn ${page === 'spot' ? 'active' : ''}`} onClick={() => setPage('spot')}>
                  Spot
                </button>
              </div>
            </div>

            <div style={{ margin: '0 12px 24px' }}>
              {page === 'spot' ? (
                <SpotPanel prices={prices} account={account} onConnect={connect} isConnecting={isConnecting} />
              ) : (
                <TradingPanel
                  sym={sym} prices={prices} account={account}
                  isConnecting={isConnecting} onTrade={handleTrade}
                  onConnect={connect} pending={pending} step={step}
                />
              )}
            </div>
          </>
        )}

        {/* ── Positions tab ── */}
        {mobileTab === 'positions' && (
          <MobilePositionsList
            positions={positions} prices={prices} loading={loading} pending={pending}
            onClose={handleClose} onSlTp={handleSlTp}
            onIncrease={handleIncrease} onCancelOrder={handleCancelOrder}
          />
        )}

        {/* ── Orders tab ── */}
        {mobileTab === 'orders' && (
          <MobileOrdersList
            orders={orders} pending={pending}
            onCancelOrder={handleCancelOrder}
          />
        )}

        {/* ── Portfolio tab ── */}
        {mobileTab === 'portfolio' && (
          <div style={{ padding: '12px' }}>
            {/* Points */}
            <div className="card card-p" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>GDX Points</span>
                <button className="btn btn-sm btn-ghost" onClick={() => setShowPts(true)}>Details</button>
              </div>
              <div className="mono" style={{ fontSize: 30, fontWeight: 800, color: 'var(--green)', marginBottom: 4 }}>
                {(pts.pts || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Level: <strong style={{ color: 'var(--text-2)' }}>{pts.level?.name}</strong>
              </div>
              <div style={{ marginTop: 10, height: 4, background: 'var(--surface-3)', borderRadius: 99 }}>
                <div style={{ height: '100%', width: `${pts.pct}%`, background: 'var(--green)', borderRadius: 99 }} />
              </div>
            </div>

            {/* Cross margin */}
            {account && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ padding: '14px 16px 0', fontWeight: 700, fontSize: 15 }}>Cross Margin</div>
                <AccountPanel
                  crossAccount={crossAccount} account={account}
                  onDeposit={handleCrossDeposit} onWithdraw={handleCrossWithdraw}
                  pending={pending}
                />
              </div>
            )}

            {/* Vault */}
            {vault && (
              <div className="card card-p" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Vault</div>
                {[['TVL', vault.tvlFmt], ['Utilization', vault.utilFmt]].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{k}</span>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Faucet */}
            {account ? (
              <button
                className="btn btn-outline btn-lg btn-block"
                onClick={handleFaucet}
                disabled={pending}
              >
                {pending ? <><span className="spinner" /> Claiming…</> : 'Claim Testnet USDC'}
              </button>
            ) : (
              <button className="btn btn-primary btn-lg btn-block" onClick={connect} disabled={isConnecting}>
                {isConnecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
            )}
          </div>
        )}
      </div>

      <MobileNav
        active={mobileTab}
        onChange={setMobileTab}
        posCount={posCount}
        orderCount={orderCount}
      />
    </div>
  )

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <>
      {desktopLayout}
      {mobileLayout}

      {showPts && (
        <PointsModal
          pts={{ total: pts.pts, streak: pts.state?.streak }}
          level={pts.level?.name}
          pct={pts.pct}
          winRate={pts.winRate}
          ptsPerTrade={pts.ptsPerTrade}
          trades={pts.trades}
          wins={pts.wins}
          activity={pts.activity}
          onClose={() => setShowPts(false)}
        />
      )}
    </>
  )
}
