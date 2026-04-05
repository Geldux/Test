import { useState, useCallback } from 'react'
import { useWallet }    from '@/hooks/useWallet'
import { usePrices }    from '@/hooks/usePrices'
import { usePositions } from '@/hooks/usePositions'
import { useTrading }   from '@/hooks/useTrading'
import { usePoints }    from '@/hooks/usePoints'
import { useVaultStats } from '@/hooks/useVaultStats'
import { fmtUsdcCompact } from '@/utils/format'
import { MARKETS }      from '@/config/markets'

import { toast }        from '@/components/Toast'
import { DesktopHeader, MobileHeader } from '@/components/Header'
import { DesktopMarketBar, MobileMarketChips } from '@/components/MarketBar'
import { DesktopMarketStats, OICard, MobileMarketStats } from '@/components/MarketStats'
import { TradingPanel } from '@/components/TradingPanel'
import { DesktopPositionsPanel, MobilePositionsList } from '@/components/PositionsPanel'
import { MobileNav }    from '@/components/MobileNav'
import { PointsModal }  from '@/components/PointsModal'

/* ── helpers ─────────────────────────────────────────────────────────────── */
function truncHash(h) { return h ? h.slice(0, 10) + '…' : '' }

/* ── App ─────────────────────────────────────────────────────────────────── */
export default function App() {
  /* wallet */
  const { account, isConnecting, chainOk, connect, disconnect } = useWallet()

  /* data */
  const { prices, oi, funding }                         = usePrices()
  const { positions, orders, crossAccount, loading, refresh } = usePositions(account)
  const { stats: vaultStats }                            = useVaultStats()
  const vault = vaultStats ? {
    tvl:   vaultStats.freeBalance + vaultStats.reservedCollateral,
    tvlFmt: '$' + fmtUsdcCompact(vaultStats.freeBalance + vaultStats.reservedCollateral),
    util:  vaultStats.reservedCollateral / (vaultStats.freeBalance + vaultStats.reservedCollateral || 1),
    utilFmt: ((vaultStats.reservedCollateral / (vaultStats.freeBalance + vaultStats.reservedCollateral || 1)) * 100).toFixed(1) + '%',
    apyFmt: '—',
  } : null

  /* trading actions */
  const {
    pending, step,
    openPosition, closePosition,
    increasePosition,
    createLimitOrder, createStopLoss, createTakeProfit, cancelOrder,
    crossDeposit,
    claimFaucet,
  } = useTrading()

  /* points */
  const ptsHook = usePoints()

  /* UI state */
  const [sym,        setSym]        = useState(MARKETS[0].sym)
  const [mobileTab,  setMobileTab]  = useState('trade')
  const [showPts,    setShowPts]    = useState(false)

  /* ── trade handler ──────────────────────────────────────────────────────── */
  const handleTrade = useCallback(async ({ type, sym: s, isLong, leverage, collateralUsd, triggerPrice, mode }) => {
    try {
      if (type === 'open') {
        const { hash } = await openPosition({ sym: s, isLong, leverage, collateralUsd })
        toast.success(`Opened ${isLong ? 'Long' : 'Short'} ${s} · ${truncHash(hash)}`)
        ptsHook.onOpen(hash, s, collateralUsd)
        setTimeout(refresh, 3000)
      } else if (type === 'limit') {
        const { hash } = await createLimitOrder({ sym: s, isLong, leverage, collateralUsd, triggerPrice })
        toast.success(`Limit order placed · ${truncHash(hash)}`)
        setTimeout(refresh, 3000)
      }
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Transaction failed')
    }
  }, [openPosition, createLimitOrder, ptsHook, refresh])

  /* ── close handler ──────────────────────────────────────────────────────── */
  const handleClose = useCallback(async (posId, sizePct) => {
    const pos = positions.find((p) => p.id === posId)
    try {
      const { hash } = await closePosition({ posId, sym: pos?.sym || 'BTC' })
      toast.success(`Closed ${pos?.sym || 'position'} · ${truncHash(hash)}`)
      if (pos) ptsHook.onClose(posId, pos.sym, pos.pnl)
      setTimeout(refresh, 3000)
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Close failed')
    }
  }, [closePosition, positions, ptsHook, refresh])

  /* ── SL/TP handler ──────────────────────────────────────────────────────── */
  const handleSlTp = useCallback(async (posId, type, price) => {
    try {
      if (type === 'sl') {
        await createStopLoss({ posId, triggerPrice: price })
        toast.success('Stop-loss set')
      } else {
        await createTakeProfit({ posId, triggerPrice: price })
        toast.success('Take-profit set')
      }
      ptsHook.onSlTpSet('pos', type)
      setTimeout(refresh, 2000)
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Failed to set order')
    }
  }, [createStopLoss, createTakeProfit, ptsHook, refresh])

  /* ── cancel order ───────────────────────────────────────────────────────── */
  const handleCancelOrder = useCallback(async (orderId) => {
    try {
      await cancelOrder({ orderId })
      toast.success('Order cancelled')
      setTimeout(refresh, 2000)
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Cancel failed')
    }
  }, [cancelOrder, refresh])

  /* ── increase position ──────────────────────────────────────────────────── */
  const handleIncrease = useCallback(async (posId, collateralUsd, sym) => {
    try {
      const { hash } = await increasePosition({ posId, sym: sym || 'BTC', collateralUsd })
      toast.success(`Position increased · ${truncHash(hash)}`)
      setTimeout(refresh, 3000)
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Increase failed')
    }
  }, [increasePosition, refresh])

  /* ── cross margin ───────────────────────────────────────────────────────── */
  const handleCrossDeposit = useCallback(async (amountUsd) => {
    try {
      const { hash } = await crossDeposit({ amountUsd })
      toast.success(`Cross margin deposited · ${truncHash(hash)}`)
      setTimeout(refresh, 3000)
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Deposit failed')
    }
  }, [crossDeposit, refresh])

  /* ── faucet ─────────────────────────────────────────────────────────────── */
  const handleFaucet = useCallback(async () => {
    try {
      const { hash } = await claimFaucet()
      toast.success(`Faucet claimed · ${truncHash(hash)}`)
      setTimeout(refresh, 3000)
    } catch (e) {
      toast.error(e?.reason || e?.message || 'Faucet failed')
    }
  }, [claimFaucet, refresh])

  /* ── derived counts ─────────────────────────────────────────────────────── */
  const posCount   = positions.filter((p) => p.isOpen).length
  const orderCount = orders.length

  /* ─────────────────────────────────────────────────────────────────────────
     DESKTOP LAYOUT — 3-column CSS grid
  ────────────────────────────────────────────────────────────────────────── */
  const desktopLayout = (
    <div className="desktop-only" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <DesktopHeader
        account={account}
        isConnecting={isConnecting}
        chainOk={chainOk}
        pts={ptsHook.pts}
        level={ptsHook.level}
        connect={connect}
        disconnect={disconnect}
        onPointsClick={() => setShowPts(true)}
      />

      <div className="d-body">
        {/* Left sidebar — market list */}
        <DesktopMarketBar
          prices={prices}
          oi={oi}
          funding={funding}
          selected={sym}
          onSelect={setSym}
        />

        {/* Center — chart placeholder + positions */}
        <main className="d-center">
          <DesktopMarketStats
            sym={sym}
            prices={prices}
            oi={oi}
            funding={funding}
          />

          {/* Chart area placeholder — user will add API later */}
          <div className="card" style={{
            flex: '1 1 auto',
            minHeight: 280,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 8,
            color: 'var(--text-3)',
            fontSize: 13,
            border: '1.5px dashed var(--border-1)',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Chart coming soon
          </div>

          {/* Positions & orders table */}
          <DesktopPositionsPanel
            positions={positions}
            orders={orders}
            prices={prices}
            account={account}
            loading={loading}
            pending={pending}
            onClose={handleClose}
            onSlTp={handleSlTp}
            onCancelOrder={handleCancelOrder}
          />
        </main>

        {/* Right panel — trade form + OI card */}
        <aside className="d-panel">
          <div className="d-panel-header">
            <span className="d-panel-title">{sym}/USD</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Perpetual</span>
          </div>
          <TradingPanel
            sym={sym}
            prices={prices}
            account={account}
            isConnecting={isConnecting}
            onTrade={handleTrade}
            onConnect={connect}
            pending={pending}
            step={step}
          />
          <OICard sym={sym} oi={oi} />

          {/* Vault stats */}
          {vault && (
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Vault
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: 'TVL',        value: vault.tvlFmt },
                  { label: 'Utilization', value: vault.utilFmt },
                  { label: 'APY (est.)',  value: vault.apyFmt },
                ].map((r) => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>{r.value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )

  /* ─────────────────────────────────────────────────────────────────────────
     MOBILE LAYOUT — tabbed single column
  ────────────────────────────────────────────────────────────────────────── */
  const mobileLayout = (
    <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <MobileHeader
        account={account}
        isConnecting={isConnecting}
        chainOk={chainOk}
        pts={ptsHook.pts}
        level={ptsHook.level}
        connect={connect}
        disconnect={disconnect}
        onPointsClick={() => setShowPts(true)}
      />

      <MobileMarketChips
        prices={prices}
        selected={sym}
        onSelect={(s) => { setSym(s); setMobileTab('trade') }}
      />

      {/* scrollable content */}
      <div className="m-content">

        {/* ── Trade tab ── */}
        {mobileTab === 'trade' && (
          <>
            <MobileMarketStats
              sym={sym}
              prices={prices}
              oi={oi}
              funding={funding}
            />

            {/* Chart placeholder */}
            <div style={{
              margin: '0 12px 12px',
              height: 160,
              background: 'var(--surface)',
              border: '1.5px dashed var(--border-1)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 6,
              color: 'var(--text-3)',
              fontSize: 12,
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              Chart coming soon
            </div>

            <div className="card" style={{ margin: '0 12px 12px' }}>
              <TradingPanel
                sym={sym}
                prices={prices}
                account={account}
                isConnecting={isConnecting}
                onTrade={handleTrade}
                onConnect={connect}
                pending={pending}
                step={step}
              />
            </div>
          </>
        )}

        {/* ── Positions tab ── */}
        {mobileTab === 'positions' && (
          <MobilePositionsList
            positions={positions}
            prices={prices}
            account={account}
            loading={loading}
            pending={pending}
            onClose={handleClose}
            onSlTp={handleSlTp}
          />
        )}

        {/* ── Orders tab ── */}
        {mobileTab === 'orders' && (
          <div style={{ padding: '12px' }}>
            {orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 13 }}>
                No open orders
              </div>
            ) : (
              orders.map((o) => (
                <div key={o.id} className="card" style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', marginBottom: 2 }}>
                        {o.sym} · {o.isLong ? <span style={{ color: 'var(--long)' }}>Long</span> : <span style={{ color: 'var(--short)' }}>Short</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{o.type} @ ${o.triggerPrice?.toFixed(2)}</div>
                    </div>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => handleCancelOrder(o.id)}
                      disabled={pending}
                    >
                      Cancel
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Size</div>
                      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>${o.size?.toFixed(2) || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Leverage</div>
                      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{o.leverage}×</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Portfolio tab ── */}
        {mobileTab === 'portfolio' && (
          <div style={{ padding: '12px' }}>
            {/* Points card */}
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>GDX Points</div>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setShowPts(true)}
                >
                  Details
                </button>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--blue)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>
                {ptsHook.pts.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Level: <strong style={{ color: 'var(--text-2)' }}>{ptsHook.level.name}</strong></div>
              <div style={{ marginTop: 10, height: 4, background: 'var(--border-1)', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${ptsHook.pct}%`, background: 'var(--blue)', borderRadius: 2 }} />
              </div>
            </div>

            {/* Cross margin card */}
            {account && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)', marginBottom: 10 }}>Cross Margin</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Balance</span>
                  <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    ${crossAccount?.balance != null ? crossAccount.balance.toFixed(2) : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Margin Ratio</span>
                  <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    {crossAccount?.marginRatio != null ? (crossAccount.marginRatio * 100).toFixed(1) + '%' : '—'}
                  </span>
                </div>
                <button
                  className="btn btn-sm btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => {
                    const amt = prompt('Deposit amount (USDC):')
                    if (amt && !isNaN(parseFloat(amt))) handleCrossDeposit(parseFloat(amt))
                  }}
                  disabled={pending}
                >
                  Deposit USDC
                </button>
              </div>
            )}

            {/* Vault stats */}
            {vault && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)', marginBottom: 10 }}>Vault</div>
                {[
                  { label: 'TVL',         value: vault.tvlFmt },
                  { label: 'Utilization', value: vault.utilFmt },
                  { label: 'APY (est.)',  value: vault.apyFmt },
                ].map((r) => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{r.value || '—'}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Faucet */}
            {account && (
              <button
                className="btn btn-ghost btn-block"
                onClick={handleFaucet}
                disabled={pending}
              >
                Claim Testnet USDC
              </button>
            )}

            {!account && (
              <button
                className="btn btn-primary btn-block"
                onClick={connect}
                disabled={isConnecting}
              >
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

  /* ─────────────────────────────────────────────────────────────────────────
     POINTS MODAL (shared)
  ────────────────────────────────────────────────────────────────────────── */
  return (
    <>
      {desktopLayout}
      {mobileLayout}

      {showPts && (
        <PointsModal
          pts={{ total: ptsHook.pts }}
          level={ptsHook.level.name}
          pct={ptsHook.pct}
          winRate={ptsHook.winRate}
          ptsPerTrade={ptsHook.ptsPerTrade}
          trades={ptsHook.trades}
          wins={ptsHook.wins}
          activity={ptsHook.activity}
          onClose={() => setShowPts(false)}
        />
      )}
    </>
  )
}
