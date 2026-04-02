import { useState } from 'react'
import { ChevronDown, Info, TrendingUp, TrendingDown } from 'lucide-react'
import styles from './Perps.module.css'

const MARKETS = [
  { sym: 'BTC',  name: 'Bitcoin',   price: '62,140.00', change: +2.14, funding: '+0.010%' },
  { sym: 'ETH',  name: 'Ethereum',  price:  '3,012.50', change: -0.82, funding: '+0.005%' },
  { sym: 'SOL',  name: 'Solana',    price:    '148.30', change: +1.45, funding: '+0.008%' },
  { sym: 'BSLV', name: 'BaseLove',  price:     '0.4821',change: +0.00, funding:  '0.000%' },
]

const PAIR_STATS = [
  { label: 'Mark Price',    value: '$62,140.00', positive: true  },
  { label: 'Index Price',   value: '$62,136.50', positive: null  },
  { label: '24h Change',    value: '+2.14%',     positive: true  },
  { label: 'Open Interest', value: '$4.2B',      positive: null  },
  { label: 'Funding Rate',  value: '0.010%',     positive: null  },
  { label: 'Next Funding',  value: '04:32:11',   positive: null  },
]

const POSITIONS = [
  { pair: 'BTC-PERP', side: 'Long',  size: '0.50 BTC', entry: '$61,200', mark: '$62,140', pnl: '+$470.00', pnlPct: +1.54, liq: '$55,080', margin: '$3,060' },
  { pair: 'ETH-PERP', side: 'Short', size: '3.00 ETH', entry: '$3,080',  mark: '$3,012',  pnl: '+$202.50', pnlPct: +2.19, liq: '$3,388',  margin:   '$924' },
]

const BOTTOM_TABS = ['Positions', 'Orders', 'History']

// Realistic SVG chart path for the placeholder
const CHART_PATH = 'M0,180 L40,165 L80,172 L120,150 L160,158 L200,140 L240,132 L280,145 L320,120 L360,108 L400,115 L440,95 L480,88 L520,102 L560,80 L600,72 L640,85 L680,65 L720,58 L760,70 L800,50'

export default function Perps() {
  const [activePair, setActivePair]     = useState('BTC')
  const [side, setSide]                 = useState('long')
  const [leverage, setLeverage]         = useState(10)
  const [collateral, setCollateral]     = useState('')
  const [mobileTab, setMobileTab]       = useState('chart')
  const [bottomTab, setBottomTab]       = useState('Positions')

  const market = MARKETS.find((m) => m.sym === activePair) ?? MARKETS[0]
  const estMargin  = collateral ? (parseFloat(collateral) || 0).toFixed(2) : '—'
  const estSize    = collateral ? ((parseFloat(collateral) || 0) * leverage).toFixed(2) : '—'

  return (
    <div className={styles.page}>
      {/* ── Pair bar ── */}
      <div className={styles.pairBar}>
        <button className={styles.pairSelector}>
          <span className={styles.pairName}>{activePair}-PERP</span>
          <ChevronDown size={14} />
        </button>
        <div className={styles.pairStats}>
          {PAIR_STATS.map(({ label, value, positive }) => (
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
          {MARKETS.map((m) => (
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
                  {m.change >= 0 ? '+' : ''}{m.change.toFixed(2)}%
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* CENTER — chart */}
        <div className={`${styles.chartArea} ${mobileTab === 'chart' ? styles.mobileVisible : styles.mobileHidden}`}>
          <div className={styles.chartFrame}>
            <svg className={styles.chartSvg} viewBox="0 0 800 240" preserveAspectRatio="none">
              {/* Grid lines */}
              {[0,60,120,180,240].map((y) => (
                <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="var(--color-border-subtle)" strokeWidth="1" />
              ))}
              {[0,133,266,400,533,666,800].map((x) => (
                <line key={x} x1={x} y1="0" x2={x} y2="240" stroke="var(--color-border-subtle)" strokeWidth="1" />
              ))}
              {/* Area fill */}
              <defs>
                <linearGradient id="perpFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              <path
                d={`${CHART_PATH} L800,240 L0,240 Z`}
                fill="url(#perpFill)"
              />
              {/* Price line */}
              <polyline
                points={CHART_PATH}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            {/* Y-axis price labels */}
            <div className={styles.priceAxis}>
              {['62,500', '62,350', '62,200', '62,050', '61,900'].map((p) => (
                <span key={p} className={styles.priceLabel}>{p}</span>
              ))}
            </div>
          </div>
          {/* X-axis time labels */}
          <div className={styles.timeAxis}>
            {['09:00','10:00','11:00','12:00','13:00','14:00','15:00'].map((t) => (
              <span key={t} className={styles.timeLabel}>{t}</span>
            ))}
          </div>
        </div>

        {/* RIGHT — order form */}
        <div className={`${styles.orderPanel} ${mobileTab === 'trade' ? styles.mobileVisible : styles.mobileHidden}`}>
          {/* Long / Short tabs */}
          <div className={styles.sideTabs}>
            <button
              className={`${styles.sideTab} ${side === 'long' ? styles.longActive : ''}`}
              onClick={() => setSide('long')}
            >
              <TrendingUp size={13} />
              Long
            </button>
            <button
              className={`${styles.sideTab} ${side === 'short' ? styles.shortActive : ''}`}
              onClick={() => setSide('short')}
            >
              <TrendingDown size={13} />
              Short
            </button>
          </div>

          <div className={styles.formBody}>
            {/* Leverage */}
            <div className={styles.leverageRow}>
              <span className={styles.fieldLabel}>Leverage</span>
              <div className={styles.leverageDisplay}>{leverage}×</div>
            </div>
            <div className={styles.sliderWrap}>
              <input
                type="range"
                min="1"
                max="50"
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className={styles.slider}
              />
              <div className={styles.sliderMarks}>
                {['1×','10×','25×','50×'].map((m) => (
                  <span key={m} className={styles.sliderMark}>{m}</span>
                ))}
              </div>
            </div>

            {/* Collateral */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Collateral</label>
              <div className={styles.inputRow}>
                <input
                  type="number"
                  className={styles.numInput}
                  placeholder="0.00"
                  value={collateral}
                  onChange={(e) => setCollateral(e.target.value)}
                />
                <span className={styles.inputUnit}>USDC</span>
              </div>
              <div className={styles.pctRow}>
                {['25%','50%','75%','100%'].map((p) => (
                  <button key={p} className={styles.pctBtn}>{p}</button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className={styles.summary}>
              {[
                { label: 'Position Size', value: estSize === '—' ? '—' : `$${estSize}` },
                { label: 'Est. Margin',   value: estMargin === '—' ? '—' : `$${estMargin}` },
                { label: 'Est. Liq. Price', value: '—' },
                { label: 'Fees',          value: '~0.045%' },
              ].map(({ label, value }) => (
                <div key={label} className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>{label}</span>
                  <span className={styles.summaryValue}>{value}</span>
                </div>
              ))}
            </div>

            {/* Available */}
            <div className={styles.balanceRow}>
              <span className={styles.balLabel}>Available</span>
              <span className={styles.balValue}>12,480.00 USDC</span>
            </div>

            {/* Submit */}
            <button className={`${styles.submitBtn} ${side === 'long' ? styles.submitLong : styles.submitShort}`}>
              {side === 'long' ? 'Open Long' : 'Open Short'} · {leverage}×
            </button>
          </div>
        </div>
      </div>

      {/* ── Bottom panel — positions ── */}
      <div className={`${styles.bottomPanel} ${mobileTab === 'positions' ? styles.mobileVisible : styles.mobileHidden}`}>
        <div className={styles.bottomTabs}>
          {BOTTOM_TABS.map((t) => (
            <button
              key={t}
              className={`${styles.bottomTab} ${bottomTab === t ? styles.bottomTabActive : ''}`}
              onClick={() => setBottomTab(t)}
            >
              {t}
              {t === 'Positions' && POSITIONS.length > 0 && (
                <span className={styles.tabCount}>{POSITIONS.length}</span>
              )}
            </button>
          ))}
          <div className={styles.bottomTabsSpacer} />
          <div className={styles.pnlSummary}>
            <span className={styles.pnlLabel}>Total PnL</span>
            <span className={`${styles.pnlValue} ${styles.pos}`}>+$672.50</span>
          </div>
        </div>

        <div className={styles.bottomContent}>
          {bottomTab === 'Positions' && POSITIONS.length > 0 ? (
            <table className={styles.posTable}>
              <thead>
                <tr>
                  {['Contract','Side','Size','Entry','Mark','PnL','Liq. Price','Margin',''].map((h) => (
                    <th key={h} className={styles.posHead}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POSITIONS.map((p, i) => (
                  <tr key={i} className={styles.posRow}>
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
                      <button className={styles.closeBtn}>Close</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.emptyState}>
              <Info size={16} style={{ color: 'var(--color-text-tertiary)' }} />
              <span>No {bottomTab.toLowerCase()} to display</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
