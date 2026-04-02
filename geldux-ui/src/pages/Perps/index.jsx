import { useState, useMemo } from 'react'
import { ChevronDown, Info, TrendingUp, TrendingDown } from 'lucide-react'
import { useWallet } from '@/contexts/WalletContext'
import { useAppData } from '@/contexts/DataContext'
import styles from './Perps.module.css'

const MARKET_META = [
  { sym: 'BTC',  name: 'Bitcoin',  funding: '+0.010%' },
  { sym: 'ETH',  name: 'Ethereum', funding: '+0.005%' },
  { sym: 'SOL',  name: 'Solana',   funding: '+0.008%' },
  { sym: 'BSLV', name: 'BaseLove', funding:  '0.000%' },
]

const BOTTOM_TABS = ['Positions', 'Orders', 'History']

const CHART_PATH = 'M0,180 L40,165 L80,172 L120,150 L160,158 L200,140 L240,132 L280,145 L320,120 L360,108 L400,115 L440,95 L480,88 L520,102 L560,80 L600,72 L640,85 L680,65 L720,58 L760,70 L800,50'

function fmtP(n, sym) {
  if (!n) return '—'
  if (sym === 'BSLV') return n.toFixed(4)
  if (n < 10)  return n.toFixed(2)
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtUsd(n) {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Perps() {
  const { account }                           = useWallet()
  const { prices, balances, positions }       = useAppData()

  const [activePair, setActivePair] = useState('BTC')
  const [side,       setSide]       = useState('long')
  const [leverage,   setLeverage]   = useState(10)
  const [collateral, setCollateral] = useState('')
  const [mobileTab,  setMobileTab]  = useState('chart')
  const [bottomTab,  setBottomTab]  = useState('Positions')

  /* Live markets overlay */
  const markets = useMemo(() =>
    MARKET_META.map((m) => ({
      ...m,
      price:   fmtP(prices[m.sym], m.sym),
      rawPrice: prices[m.sym] || 0,
      change:  0,          /* no 24 h delta available */
    })),
  [prices])

  const market     = markets.find((m) => m.sym === activePair) ?? markets[0]
  const markPriceN = prices[activePair] || 0
  const markPrice  = markPriceN ? '$' + fmtP(markPriceN, activePair) : '—'

  /* Order form calculations */
  const estMargin = collateral ? (parseFloat(collateral) || 0).toFixed(2) : '—'
  const estSize   = collateral ? ((parseFloat(collateral) || 0) * leverage).toFixed(2) : '—'
  const availUsdc = balances?.USDC != null
    ? balances.USDC.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USDC'
    : '—'

  /* Map loadPos() shape → table display shape */
  const livePositions = useMemo(() =>
    positions.map((pos) => {
      const mark   = prices[pos.sym] || pos.entry
      const pct    = pos.isLong
        ? (mark - pos.entry) / pos.entry
        : (pos.entry - mark) / pos.entry
      const pnlUsd = pct * pos.sizeUSD
      return {
        id:     pos.id,
        pair:   `${pos.sym}-PERP`,
        side:   pos.isLong ? 'Long' : 'Short',
        size:   fmtUsd(pos.sizeUSD),
        entry:  fmtUsd(pos.entry),
        mark:   fmtUsd(mark),
        pnl:    (pnlUsd >= 0 ? '+' : '') + fmtUsd(Math.abs(pnlUsd)),
        pnlPct: Math.round(pct * 10_000) / 100,
        liq:    fmtUsd(pos.liqPrice),
        margin: fmtUsd(pos.colUSD),
      }
    }),
  [positions, prices])

  /* Total unrealized PnL for header */
  const totalPnl = useMemo(() =>
    positions.reduce((acc, pos) => {
      const mark = prices[pos.sym] || pos.entry
      const pct  = pos.isLong
        ? (mark - pos.entry) / pos.entry
        : (pos.entry - mark) / pos.entry
      return acc + pct * pos.sizeUSD
    }, 0),
  [positions, prices])

  const pairStats = [
    { label: 'Mark Price',    value: markPrice,    positive: null  },
    { label: 'Index Price',   value: markPrice,    positive: null  },
    { label: '24h Change',    value: '—',           positive: null  },
    { label: 'Open Interest', value: '—',           positive: null  },
    { label: 'Funding Rate',  value: market.funding, positive: null },
    { label: 'Next Funding',  value: '04:32:11',   positive: null  },
  ]

  return (
    <div className={styles.page}>
      {/* ── Pair bar ── */}
      <div className={styles.pairBar}>
        <button className={styles.pairSelector}>
          <span className={styles.pairName}>{activePair}-PERP</span>
          <ChevronDown size={14} />
        </button>
        <div className={styles.pairStats}>
          {pairStats.map(({ label, value, positive }) => (
            <div key={label} className={styles.pairStat}>
              <span className={styles.statLabel}>{label}</span>
              <span className={`${styles.statValue} mono ${
                positive === true  ? styles.pos :
                positive === false ? styles.neg : ''
              }`}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Mobile tabs ── */}
      <div className={styles.mobileTabs}>
        {['chart', 'trade', 'positions'].map((t) => (
          <button
            key={t}
            className={`${styles.mobileTab} ${mobileTab === t ? styles.mobileTabActive : ''}`}
            onClick={() => setMobileTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Terminal body ── */}
      <div className={styles.terminal}>

        {/* LEFT — market watchlist */}
        <div className={`${styles.watchlist} ${mobileTab === 'chart' ? styles.mobileVisible : styles.mobileHidden}`}>
          <div className={styles.watchlistHeader}>Markets</div>
          {markets.map((m) => (
            <button
              key={m.sym}
              className={`${styles.watchItem} ${activePair === m.sym ? styles.watchActive : ''}`}
              onClick={() => setActivePair(m.sym)}
            >
              <div className={styles.watchLeft}>
                <span className={styles.watchSym}>{m.sym}-PERP</span>
                <span className={styles.watchFunding}>{m.funding}</span>
              </div>
              <div className={styles.watchRight}>
                <span className={styles.watchPrice}>{m.price}</span>
                <span className={`${styles.watchChange} ${m.change >= 0 ? styles.pos : styles.neg}`}>
                  —
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* CENTER — chart */}
        <div className={`${styles.chartArea} ${mobileTab === 'chart' ? styles.mobileVisible : styles.mobileHidden}`}>
          <div className={styles.chartFrame}>
            <svg className={styles.chartSvg} viewBox="0 0 800 240" preserveAspectRatio="none">
              {[0,60,120,180,240].map((y) => (
                <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="var(--color-border-subtle)" strokeWidth="1" />
              ))}
              {[0,133,266,400,533,666,800].map((x) => (
                <line key={x} x1={x} y1="0" x2={x} y2="240" stroke="var(--color-border-subtle)" strokeWidth="1" />
              ))}
              <defs>
                <linearGradient id="perpFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              <path d={`${CHART_PATH} L800,240 L0,240 Z`} fill="url(#perpFill)" />
              <polyline points={CHART_PATH} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <div className={styles.priceAxis}>
              {[markPriceN * 1.003, markPriceN * 1.001, markPriceN, markPriceN * 0.999, markPriceN * 0.997].map((p, i) => (
                <span key={i} className={styles.priceLabel}>
                  {p > 0 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
                </span>
              ))}
            </div>
          </div>
          <div className={styles.timeAxis}>
            {['09:00','10:00','11:00','12:00','13:00','14:00','15:00'].map((t) => (
              <span key={t} className={styles.timeLabel}>{t}</span>
            ))}
          </div>
        </div>

        {/* RIGHT — order form */}
        <div className={`${styles.orderPanel} ${mobileTab === 'trade' ? styles.mobileVisible : styles.mobileHidden}`}>
          <div className={styles.sideTabs}>
            <button
              className={`${styles.sideTab} ${side === 'long' ? styles.longActive : ''}`}
              onClick={() => setSide('long')}
            >
              <TrendingUp size={13} /> Long
            </button>
            <button
              className={`${styles.sideTab} ${side === 'short' ? styles.shortActive : ''}`}
              onClick={() => setSide('short')}
            >
              <TrendingDown size={13} /> Short
            </button>
          </div>

          <div className={styles.formBody}>
            <div className={styles.leverageRow}>
              <span className={styles.fieldLabel}>Leverage</span>
              <div className={styles.leverageDisplay}>{leverage}×</div>
            </div>
            <div className={styles.sliderWrap}>
              <input type="range" min="1" max="50" value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} className={styles.slider} />
              <div className={styles.sliderMarks}>
                {['1×','10×','25×','50×'].map((m) => <span key={m} className={styles.sliderMark}>{m}</span>)}
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Collateral</label>
              <div className={styles.inputRow}>
                <input type="number" className={styles.numInput} placeholder="0.00" value={collateral} onChange={(e) => setCollateral(e.target.value)} />
                <span className={styles.inputUnit}>USDC</span>
              </div>
              <div className={styles.pctRow}>
                {['25%','50%','75%','100%'].map((p) => <button key={p} className={styles.pctBtn}>{p}</button>)}
              </div>
            </div>

            <div className={styles.summary}>
              {[
                { label: 'Position Size',    value: estSize   === '—' ? '—' : `$${estSize}`   },
                { label: 'Est. Margin',      value: estMargin === '—' ? '—' : `$${estMargin}` },
                { label: 'Est. Liq. Price',  value: '—' },
                { label: 'Fees',             value: '~0.045%' },
              ].map(({ label, value }) => (
                <div key={label} className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>{label}</span>
                  <span className={styles.summaryValue}>{value}</span>
                </div>
              ))}
            </div>

            <div className={styles.balanceRow}>
              <span className={styles.balLabel}>Available</span>
              <span className={styles.balValue}>{availUsdc}</span>
            </div>

            {/* intentionally not wired to trade action — read-only phase */}
            <button className={`${styles.submitBtn} ${side === 'long' ? styles.submitLong : styles.submitShort}`} disabled>
              {account ? `${side === 'long' ? 'Open Long' : 'Open Short'} · ${leverage}×` : 'Connect Wallet'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Bottom panel ── */}
      <div className={`${styles.bottomPanel} ${mobileTab === 'positions' ? styles.mobileVisible : styles.mobileHidden}`}>
        <div className={styles.bottomTabs}>
          {BOTTOM_TABS.map((t) => (
            <button
              key={t}
              className={`${styles.bottomTab} ${bottomTab === t ? styles.bottomTabActive : ''}`}
              onClick={() => setBottomTab(t)}
            >
              {t}
              {t === 'Positions' && livePositions.length > 0 && (
                <span className={styles.tabCount}>{livePositions.length}</span>
              )}
            </button>
          ))}
          <div className={styles.bottomTabsSpacer} />
          {livePositions.length > 0 && (
            <div className={styles.pnlSummary}>
              <span className={styles.pnlLabel}>Total PnL</span>
              <span className={`${styles.pnlValue} ${totalPnl >= 0 ? styles.pos : styles.neg}`}>
                {totalPnl >= 0 ? '+' : ''}{fmtUsd(Math.abs(totalPnl))}
              </span>
            </div>
          )}
        </div>

        <div className={styles.bottomContent}>
          {bottomTab === 'Positions' && livePositions.length > 0 ? (
            <table className={styles.posTable}>
              <thead>
                <tr>
                  {['Contract','Side','Size','Entry','Mark','PnL','Liq. Price','Margin',''].map((h) => (
                    <th key={h} className={styles.posHead}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {livePositions.map((p) => (
                  <tr key={p.id} className={styles.posRow}>
                    <td className={`${styles.posCell} mono`} style={{ fontWeight: 'var(--weight-semibold)' }}>{p.pair}</td>
                    <td className={styles.posCell}>
                      <span className={`${styles.sideBadge} ${p.side === 'Long' ? styles.longBadge : styles.shortBadge}`}>{p.side}</span>
                    </td>
                    <td className={`${styles.posCell} mono`}>{p.size}</td>
                    <td className={`${styles.posCell} mono`}>{p.entry}</td>
                    <td className={`${styles.posCell} mono`}>{p.mark}</td>
                    <td className={`${styles.posCell} mono ${p.pnlPct >= 0 ? styles.pos : styles.neg}`} style={{ fontWeight: 'var(--weight-medium)' }}>
                      {p.pnl} <span style={{ opacity: 0.7 }}>({p.pnlPct >= 0 ? '+' : ''}{p.pnlPct}%)</span>
                    </td>
                    <td className={`${styles.posCell} mono`} style={{ color: 'var(--color-text-tertiary)' }}>{p.liq}</td>
                    <td className={`${styles.posCell} mono`} style={{ color: 'var(--color-text-tertiary)' }}>{p.margin}</td>
                    <td className={styles.posCell}>
                      {/* Close button intentionally disabled — trading actions not yet wired */}
                      <button className={styles.closeBtn} disabled>Close</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.emptyState}>
              <Info size={16} style={{ color: 'var(--color-text-tertiary)' }} />
              <span>
                {bottomTab === 'Positions' && !account ? 'Connect wallet to see positions' : `No ${bottomTab.toLowerCase()} to display`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
