import { useState } from 'react'
import { ChevronDown, Search, ArrowUpDown, X, ChevronUp } from 'lucide-react'
import styles from './Spot.module.css'

/* ── Static data ──────────────────────────────────────────────────────────── */

const ASKS = [
  { price: '62,180.00', size: '0.142', depth: 28 },
  { price: '62,165.00', size: '0.310', depth: 62 },
  { price: '62,155.00', size: '0.085', depth: 17 },
  { price: '62,148.00', size: '0.500', depth: 100 },
  { price: '62,142.00', size: '0.220', depth: 44 },
]
const BIDS = [
  { price: '62,138.00', size: '0.310', depth: 62 },
  { price: '62,130.00', size: '0.420', depth: 84 },
  { price: '62,118.00', size: '0.174', depth: 35 },
  { price: '62,100.00', size: '0.640', depth: 100 },
  { price: '62,085.00', size: '0.095', depth: 19 },
]

const MARKETS = [
  { sym: 'BTC',  name: 'Bitcoin',  price: '62,140.00', change: +2.14 },
  { sym: 'ETH',  name: 'Ethereum', price: '3,012.50',  change: -0.82 },
  { sym: 'SOL',  name: 'Solana',   price: '148.30',    change: +1.45 },
  { sym: 'BSLV', name: 'BaseLove', price: '0.4821',    change: +0.00 },
]

/* Compute ask totals (cumulative size * price, simplified to size * price) */
function calcTotal(price, size) {
  const p = parseFloat(price.replace(/,/g, ''))
  const s = parseFloat(size)
  return (p * s).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/* Chart SVG polyline path — fake realistic BTC candle line */
const CHART_POINTS = [
  [0, 320], [30, 295], [60, 310], [90, 270], [120, 255], [150, 280],
  [180, 260], [210, 230], [240, 245], [270, 220], [300, 210], [330, 195],
  [360, 215], [390, 200], [420, 185], [450, 170], [480, 188], [510, 172],
  [540, 155], [570, 160], [600, 145], [630, 130], [660, 148], [690, 135],
  [720, 120], [750, 108], [780, 125], [810, 115], [840, 100], [870, 88],
]
const CHART_PATH = CHART_POINTS.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
const CHART_AREA = CHART_PATH + ` L${CHART_POINTS[CHART_POINTS.length - 1][0]},400 L0,400 Z`

const PRICE_LABELS = ['62,200', '62,160', '62,120', '62,080', '62,040', '62,000']
const TIME_LABELS  = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00']

/* ── Sub-components ───────────────────────────────────────────────────────── */

function Watchlist({ selected, onSelect, search, onSearch }) {
  const filtered = MARKETS.filter(
    (m) =>
      m.sym.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <aside className={styles.watchlist}>
      <div className={styles.watchlistSearch}>
        <Search size={13} className={styles.searchIcon} />
        <input
          type="text"
          placeholder="Search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className={styles.searchInput}
        />
      </div>
      <div className={styles.watchlistHeader}>
        <span>Pair</span>
        <span>Change</span>
      </div>
      <ul className={styles.watchlistList}>
        {filtered.map((m) => (
          <li
            key={m.sym}
            className={`${styles.watchlistItem} ${selected === m.sym ? styles.watchlistItemActive : ''}`}
            onClick={() => onSelect(m.sym)}
          >
            <div className={styles.watchlistSymbol}>
              <span className={styles.watchlistSymDot} data-sym={m.sym} />
              <div className={styles.watchlistSymText}>
                <span className={styles.watchlistSym}>{m.sym}</span>
                <span className={styles.watchlistName}>/USDT</span>
              </div>
            </div>
            <div className={styles.watchlistRight}>
              <span className={styles.watchlistPrice}>{m.price}</span>
              <span
                className={
                  m.change > 0
                    ? styles.changePos
                    : m.change < 0
                    ? styles.changeNeg
                    : styles.changeFlat
                }
              >
                {m.change > 0 ? '+' : ''}
                {m.change.toFixed(2)}%
              </span>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function ChartPlaceholder() {
  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartTopBar}>
        <div className={styles.chartTimeTabs}>
          {['1m', '5m', '15m', '1h', '4h', '1D'].map((t) => (
            <button key={t} className={`${styles.chartTimeTab} ${t === '1h' ? styles.chartTimeTabActive : ''}`}>
              {t}
            </button>
          ))}
        </div>
        <div className={styles.chartActions}>
          <button className={styles.chartActionBtn}>
            <ArrowUpDown size={13} />
            <span>Indicators</span>
          </button>
        </div>
      </div>
      <div className={styles.chartBody}>
        {/* Price axis */}
        <div className={styles.chartPriceAxis}>
          {PRICE_LABELS.map((label) => (
            <span key={label} className={styles.chartAxisLabel}>{label}</span>
          ))}
        </div>
        {/* SVG chart */}
        <div className={styles.chartSvgWrap}>
          <svg
            viewBox="0 0 870 400"
            preserveAspectRatio="none"
            className={styles.chartSvg}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Horizontal grid lines */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <line
                key={i}
                x1="0"
                y1={i * 80}
                x2="870"
                y2={i * 80}
                stroke="var(--color-border-subtle)"
                strokeWidth="1"
              />
            ))}
            {/* Vertical grid lines */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <line
                key={i}
                x1={i * 174}
                y1="0"
                x2={i * 174}
                y2="400"
                stroke="var(--color-border-subtle)"
                strokeWidth="1"
              />
            ))}
            {/* Area fill */}
            <path d={CHART_AREA} fill="url(#chartGrad)" />
            {/* Price line */}
            <path
              d={CHART_PATH}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Current price marker */}
            <circle cx="870" cy="88" r="3.5" fill="var(--color-accent)" />
            <line x1="0" y1="88" x2="870" y2="88" stroke="var(--color-accent)" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
          </svg>
          {/* Current price tag */}
          <div className={styles.chartCurrentPrice}>
            62,140.00
          </div>
        </div>
        {/* Time axis */}
        <div className={styles.chartTimeAxis}>
          {TIME_LABELS.map((label) => (
            <span key={label} className={styles.chartAxisLabel}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function OrderBook() {
  return (
    <div className={styles.orderBook}>
      <div className={styles.obHeader}>
        <span className={styles.obTitle}>Order Book</span>
        <div className={styles.obPrecision}>
          <span className={styles.obPrecisionLabel}>0.01</span>
          <ChevronDown size={11} />
        </div>
      </div>
      <div className={styles.obLabels}>
        <span>Price (USDT)</span>
        <span className={styles.obLabelRight}>Size (BTC)</span>
        <span className={styles.obLabelRight}>Total</span>
      </div>

      {/* Asks — reversed so highest ask is at top, lowest is nearest spread */}
      <div className={styles.obAsks}>
        {[...ASKS].reverse().map((row, i) => (
          <div
            key={i}
            className={`${styles.obRow} ${styles.obRowAsk}`}
            style={{ '--depth': `${row.depth}%` }}
          >
            <span className={styles.obAskPrice}>{row.price}</span>
            <span className={`${styles.obCell} ${styles.obCellRight}`}>{row.size}</span>
            <span className={`${styles.obCell} ${styles.obCellRight}`}>{calcTotal(row.price, row.size)}</span>
          </div>
        ))}
      </div>

      {/* Spread */}
      <div className={styles.obSpread}>
        <span className={styles.obSpreadPrice}>62,140.00</span>
        <span className={styles.obSpreadBadge}>
          <ChevronUp size={10} />
          Spread 2.00
        </span>
      </div>

      {/* Bids */}
      <div className={styles.obBids}>
        {BIDS.map((row, i) => (
          <div
            key={i}
            className={`${styles.obRow} ${styles.obRowBid}`}
            style={{ '--depth': `${row.depth}%` }}
          >
            <span className={styles.obBidPrice}>{row.price}</span>
            <span className={`${styles.obCell} ${styles.obCellRight}`}>{row.size}</span>
            <span className={`${styles.obCell} ${styles.obCellRight}`}>{calcTotal(row.price, row.size)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function OrderForm({ market }) {
  const [side, setSide]           = useState('buy')
  const [orderType, setOrderType] = useState('limit')
  const [price, setPrice]         = useState('')
  const [amount, setAmount]       = useState('')

  const isLimit = orderType === 'limit'

  return (
    <div className={styles.orderForm}>
      {/* Buy / Sell tabs */}
      <div className={styles.sideTabs}>
        <button
          className={`${styles.sideTab} ${side === 'buy' ? styles.sideTabBuyActive : styles.sideTabInactive}`}
          onClick={() => setSide('buy')}
        >
          Buy
        </button>
        <button
          className={`${styles.sideTab} ${side === 'sell' ? styles.sideTabSellActive : styles.sideTabInactive}`}
          onClick={() => setSide('sell')}
        >
          Sell
        </button>
      </div>

      {/* Order type pills */}
      <div className={styles.orderTypePills}>
        {['limit', 'market', 'stop'].map((t) => (
          <button
            key={t}
            className={`${styles.orderTypePill} ${orderType === t ? styles.orderTypePillActive : ''}`}
            onClick={() => setOrderType(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Available balance */}
      <div className={styles.availRow}>
        <span className={styles.availLabel}>Available</span>
        <span className={styles.availValue}>
          {side === 'buy' ? '12,480.00 USDT' : '0.3240 BTC'}
        </span>
      </div>

      {/* Fields */}
      <div className={styles.formFields}>
        {isLimit && (
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Price</label>
            <div className={styles.fieldWrap}>
              <input
                type="text"
                className={styles.fieldInput}
                placeholder="62,140.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <span className={styles.fieldSuffix}>USDT</span>
            </div>
          </div>
        )}

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Amount</label>
          <div className={styles.fieldWrap}>
            <input
              type="text"
              className={styles.fieldInput}
              placeholder="0.0000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className={styles.fieldSuffix}>{market.sym}</span>
          </div>
        </div>

        {/* Percent quick-fill */}
        <div className={styles.percentRow}>
          {['25%', '50%', '75%', '100%'].map((p) => (
            <button key={p} className={styles.percentBtn}>{p}</button>
          ))}
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Total</label>
          <div className={styles.fieldWrap}>
            <input
              type="text"
              className={styles.fieldInput}
              placeholder="0.00"
              readOnly
            />
            <span className={styles.fieldSuffix}>USDT</span>
          </div>
        </div>
      </div>

      <button
        className={`${styles.submitBtn} ${side === 'buy' ? styles.submitBtnBuy : styles.submitBtnSell}`}
      >
        {side === 'buy' ? 'Buy' : 'Sell'} {market.sym}
      </button>
    </div>
  )
}

function BottomPanel() {
  const [activeTab, setActiveTab] = useState('positions')
  const TABS = [
    { id: 'positions', label: 'Positions' },
    { id: 'orders',    label: 'Open Orders' },
    { id: 'history',   label: 'History' },
  ]

  return (
    <div className={styles.bottomPanel}>
      <div className={styles.bottomTabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`${styles.bottomTab} ${activeTab === t.id ? styles.bottomTabActive : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.bottomContent}>
        <div className={styles.emptyState}>
          <X size={18} className={styles.emptyIcon} />
          <span className={styles.emptyText}>
            {activeTab === 'positions' && 'No open positions'}
            {activeTab === 'orders'    && 'No open orders'}
            {activeTab === 'history'   && 'No trade history'}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function Spot() {
  const [selectedSym, setSelectedSym] = useState('BTC')
  const [mobileTab,   setMobileTab]   = useState('chart')
  const [search,      setSearch]      = useState('')

  const market = MARKETS.find((m) => m.sym === selectedSym) || MARKETS[0]
  const changePos = market.change > 0
  const changeNeg = market.change < 0

  return (
    <div className={styles.page}>

      {/* ── Pair bar ──────────────────────────────────────────────────────── */}
      <header className={styles.pairBar}>
        <button className={styles.pairSelector}>
          <div className={styles.pairSymDot} data-sym={market.sym} />
          <span className={styles.pairName}>{market.sym}/USDT</span>
          <ChevronDown size={14} className={styles.pairChevron} />
        </button>

        <div className={styles.pairDivider} />

        <div className={styles.pairPrice}>
          <span
            className={`${styles.pairPriceValue} ${
              changePos ? styles.pricePos : changeNeg ? styles.priceNeg : ''
            }`}
          >
            {market.price}
          </span>
          <span
            className={`${styles.pairPriceChange} ${
              changePos ? styles.changePos : changeNeg ? styles.changeNeg : styles.changeFlat
            }`}
          >
            {market.change > 0 ? '+' : ''}{market.change.toFixed(2)}%
          </span>
        </div>

        <div className={styles.pairStats}>
          <div className={styles.pairStat}>
            <span className={styles.statLabel}>24h High</span>
            <span className={styles.statValue}>62,890.00</span>
          </div>
          <div className={styles.pairStat}>
            <span className={styles.statLabel}>24h Low</span>
            <span className={styles.statValue}>60,240.00</span>
          </div>
          <div className={styles.pairStat}>
            <span className={styles.statLabel}>24h Vol (BTC)</span>
            <span className={styles.statValue}>45,182.3</span>
          </div>
          <div className={styles.pairStat}>
            <span className={styles.statLabel}>24h Vol (USDT)</span>
            <span className={styles.statValue}>2.81B</span>
          </div>
        </div>
      </header>

      {/* ── Desktop body ──────────────────────────────────────────────────── */}
      <div className={styles.desktopBody}>

        {/* Left: Watchlist */}
        <Watchlist
          selected={selectedSym}
          onSelect={setSelectedSym}
          search={search}
          onSearch={setSearch}
        />

        {/* Center: Chart */}
        <div className={styles.centerCol}>
          <ChartPlaceholder />
        </div>

        {/* Right: Order book + Order form */}
        <div className={styles.rightCol}>
          <OrderBook />
          <div className={styles.rightDivider} />
          <OrderForm market={market} />
        </div>

      </div>

      {/* ── Bottom panel (desktop) ────────────────────────────────────────── */}
      <BottomPanel />

      {/* ── Mobile layout ─────────────────────────────────────────────────── */}
      <div className={styles.mobileLayout}>

        {/* Mobile pair bar */}
        <div className={styles.mobilePairBar}>
          <div className={styles.mobilePairLeft}>
            <button className={styles.mobilePairSelector}>
              <span className={styles.mobilePairName}>{market.sym}/USDT</span>
              <ChevronDown size={13} />
            </button>
            <span
              className={`${styles.mobilePairPrice} ${
                changePos ? styles.pricePos : changeNeg ? styles.priceNeg : ''
              }`}
            >
              {market.price}
            </span>
          </div>
          <div className={styles.mobilePairRight}>
            <span
              className={`${styles.mobilePairChange} ${
                changePos ? styles.changePos : changeNeg ? styles.changeNeg : styles.changeFlat
              }`}
            >
              {market.change > 0 ? '+' : ''}{market.change.toFixed(2)}%
            </span>
            <span className={styles.mobilePairStat}>H: 62,890</span>
            <span className={styles.mobilePairStat}>L: 60,240</span>
          </div>
        </div>

        {/* Mobile tab switcher */}
        <div className={styles.mobileTabs}>
          {[
            { id: 'chart',     label: 'Chart' },
            { id: 'trade',     label: 'Trade' },
            { id: 'positions', label: 'Positions' },
          ].map((t) => (
            <button
              key={t.id}
              className={`${styles.mobileTab} ${mobileTab === t.id ? styles.mobileTabActive : ''}`}
              onClick={() => setMobileTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Mobile tab content */}
        <div className={styles.mobileContent}>

          {mobileTab === 'chart' && (
            <div className={styles.mobileChartTab}>
              <div className={styles.mobileChartWrap}>
                <ChartPlaceholder />
              </div>
              <div className={styles.mobilePairStatsGrid}>
                {[
                  { label: '24h Change', value: `${market.change > 0 ? '+' : ''}${market.change.toFixed(2)}%`, colored: true },
                  { label: '24h High',   value: '62,890.00' },
                  { label: '24h Low',    value: '60,240.00' },
                  { label: '24h Volume', value: '2.81B USDT' },
                ].map((s) => (
                  <div key={s.label} className={styles.mobileStatItem}>
                    <span className={styles.mobileStatLabel}>{s.label}</span>
                    <span
                      className={`${styles.mobileStatValue} ${
                        s.colored
                          ? changePos
                            ? styles.changePos
                            : changeNeg
                            ? styles.changeNeg
                            : styles.changeFlat
                          : ''
                      }`}
                    >
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mobileTab === 'trade' && (
            <div className={styles.mobileTradeTab}>
              <OrderForm market={market} />
            </div>
          )}

          {mobileTab === 'positions' && (
            <div className={styles.mobilePositionsTab}>
              <div className={styles.emptyState}>
                <X size={18} className={styles.emptyIcon} />
                <span className={styles.emptyText}>No open positions</span>
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  )
}
