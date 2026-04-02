import { useState, useMemo } from 'react'
import { ChevronDown, Search, ArrowUpDown, X, ChevronUp } from 'lucide-react'
import { useWallet } from '@/contexts/WalletContext'
import { useAppData } from '@/contexts/DataContext'
import styles from './Spot.module.css'

/* ── Static market metadata ──────────────────────────────────────────────── */

const MARKET_META = [
  { sym: 'BTC',  name: 'Bitcoin'  },
  { sym: 'ETH',  name: 'Ethereum' },
  { sym: 'SOL',  name: 'Solana'   },
  { sym: 'BSLV', name: 'BaseLove' },
]

/* ── Order book (static placeholder depth) ───────────────────────────────── */

const ASK_OFFSETS = [0.06, 0.05, 0.03, 0.08, 0.02]  /* % above mid */
const BID_OFFSETS = [0.02, 0.05, 0.03, 0.10, 0.01]  /* % below mid */
const ASK_SIZES   = ['0.142', '0.310', '0.085', '0.500', '0.220']
const BID_SIZES   = ['0.310', '0.420', '0.174', '0.640', '0.095']
const ASK_DEPTHS  = [28, 62, 17, 100, 44]
const BID_DEPTHS  = [62, 84, 35, 100, 19]

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fmtPrice(sym, n) {
  if (!n) return '—'
  if (sym === 'BSLV') return n.toFixed(4)
  if (n < 10)  return n.toFixed(2)
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function calcTotal(price, size) {
  const p = parseFloat(String(price).replace(/,/g, ''))
  const s = parseFloat(size)
  return (p * s).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/* ── Chart constants ─────────────────────────────────────────────────────── */

const CHART_POINTS = [
  [0, 320], [30, 295], [60, 310], [90, 270], [120, 255], [150, 280],
  [180, 260], [210, 230], [240, 245], [270, 220], [300, 210], [330, 195],
  [360, 215], [390, 200], [420, 185], [450, 170], [480, 188], [510, 172],
  [540, 155], [570, 160], [600, 145], [630, 130], [660, 148], [690, 135],
  [720, 120], [750, 108], [780, 125], [810, 115], [840, 100], [870, 88],
]
const CHART_PATH = CHART_POINTS.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
const CHART_AREA = CHART_PATH + ` L${CHART_POINTS[CHART_POINTS.length - 1][0]},400 L0,400 Z`

/* ── Sub-components ──────────────────────────────────────────────────────── */

function Watchlist({ markets, selected, onSelect, search, onSearch }) {
  const filtered = markets.filter(
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
        <span>Price</span>
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
              <span className={styles.changeFlat}>—</span>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function ChartPlaceholder({ sym, midPrice }) {
  const priceLabels = midPrice
    ? [midPrice * 1.004, midPrice * 1.002, midPrice, midPrice * 0.998, midPrice * 0.996, midPrice * 0.994]
        .map((p) => p.toLocaleString('en-US', { maximumFractionDigits: 0 }))
    : ['—', '—', '—', '—', '—', '—']
  const timeLabels = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00']

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartTopBar}>
        <div className={styles.chartTimeTabs}>
          {['1m', '5m', '15m', '1h', '4h', '1D'].map((t) => (
            <button key={t} className={`${styles.chartTimeTab} ${t === '1h' ? styles.chartTimeTabActive : ''}`}>{t}</button>
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
        <div className={styles.chartPriceAxis}>
          {priceLabels.map((label, i) => (
            <span key={i} className={styles.chartAxisLabel}>{label}</span>
          ))}
        </div>
        <div className={styles.chartSvgWrap}>
          <svg viewBox="0 0 870 400" preserveAspectRatio="none" className={styles.chartSvg} aria-hidden="true">
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <line key={i} x1="0" y1={i * 80} x2="870" y2={i * 80} stroke="var(--color-border-subtle)" strokeWidth="1" />
            ))}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <line key={i} x1={i * 174} y1="0" x2={i * 174} y2="400" stroke="var(--color-border-subtle)" strokeWidth="1" />
            ))}
            <path d={CHART_AREA} fill="url(#chartGrad)" />
            <path d={CHART_PATH} fill="none" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx="870" cy="88" r="3.5" fill="var(--color-accent)" />
            <line x1="0" y1="88" x2="870" y2="88" stroke="var(--color-accent)" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
          </svg>
          <div className={styles.chartCurrentPrice}>
            {midPrice ? midPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
          </div>
        </div>
        <div className={styles.chartTimeAxis}>
          {timeLabels.map((label) => (
            <span key={label} className={styles.chartAxisLabel}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function OrderBook({ sym, midPrice }) {
  const asks = ASK_OFFSETS.map((off, i) => {
    const p = midPrice ? midPrice * (1 + off / 100) : 0
    return { price: p ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—', size: ASK_SIZES[i], depth: ASK_DEPTHS[i] }
  })
  const bids = BID_OFFSETS.map((off, i) => {
    const p = midPrice ? midPrice * (1 - off / 100) : 0
    return { price: p ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—', size: BID_SIZES[i], depth: BID_DEPTHS[i] }
  })
  const spreadVal = midPrice ? (midPrice * (ASK_OFFSETS[0] + BID_OFFSETS[0]) / 100).toFixed(2) : '—'

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
        <span className={styles.obLabelRight}>Size ({sym})</span>
        <span className={styles.obLabelRight}>Total</span>
      </div>
      <div className={styles.obAsks}>
        {[...asks].reverse().map((row, i) => (
          <div key={i} className={`${styles.obRow} ${styles.obRowAsk}`} style={{ '--depth': `${row.depth}%` }}>
            <span className={styles.obAskPrice}>{row.price}</span>
            <span className={`${styles.obCell} ${styles.obCellRight}`}>{row.size}</span>
            <span className={`${styles.obCell} ${styles.obCellRight}`}>{row.price !== '—' ? calcTotal(row.price, row.size) : '—'}</span>
          </div>
        ))}
      </div>
      <div className={styles.obSpread}>
        <span className={styles.obSpreadPrice}>{midPrice ? midPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</span>
        <span className={styles.obSpreadBadge}>
          <ChevronUp size={10} />
          Spread {spreadVal}
        </span>
      </div>
      <div className={styles.obBids}>
        {bids.map((row, i) => (
          <div key={i} className={`${styles.obRow} ${styles.obRowBid}`} style={{ '--depth': `${row.depth}%` }}>
            <span className={styles.obBidPrice}>{row.price}</span>
            <span className={`${styles.obCell} ${styles.obCellRight}`}>{row.size}</span>
            <span className={`${styles.obCell} ${styles.obCellRight}`}>{row.price !== '—' ? calcTotal(row.price, row.size) : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function OrderForm({ sym, availUsdc, account, connect, isConnecting }) {
  const [side,      setSide]      = useState('buy')
  const [orderType, setOrderType] = useState('limit')
  const [price,     setPrice]     = useState('')
  const [amount,    setAmount]    = useState('')
  const isLimit = orderType === 'limit'

  return (
    <div className={styles.orderForm}>
      <div className={styles.sideTabs}>
        <button
          className={`${styles.sideTab} ${side === 'buy' ? styles.sideTabBuyActive : styles.sideTabInactive}`}
          onClick={() => setSide('buy')}
        >Buy</button>
        <button
          className={`${styles.sideTab} ${side === 'sell' ? styles.sideTabSellActive : styles.sideTabInactive}`}
          onClick={() => setSide('sell')}
        >Sell</button>
      </div>
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
      <div className={styles.availRow}>
        <span className={styles.availLabel}>Available</span>
        <span className={styles.availValue}>
          {account ? (availUsdc != null ? `${availUsdc} USDC` : '…') : '—'}
        </span>
      </div>
      <div className={styles.formFields}>
        {isLimit && (
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Price</label>
            <div className={styles.fieldWrap}>
              <input type="text" className={styles.fieldInput} placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
              <span className={styles.fieldSuffix}>USDT</span>
            </div>
          </div>
        )}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Amount</label>
          <div className={styles.fieldWrap}>
            <input type="text" className={styles.fieldInput} placeholder="0.0000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span className={styles.fieldSuffix}>{sym}</span>
          </div>
        </div>
        <div className={styles.percentRow}>
          {['25%', '50%', '75%', '100%'].map((p) => <button key={p} className={styles.percentBtn}>{p}</button>)}
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Total</label>
          <div className={styles.fieldWrap}>
            <input type="text" className={styles.fieldInput} placeholder="0.00" readOnly />
            <span className={styles.fieldSuffix}>USDT</span>
          </div>
        </div>
      </div>
      {/* Submit intentionally disabled — trading actions not yet wired */}
      <button
        className={`${styles.submitBtn} ${side === 'buy' ? styles.submitBtnBuy : styles.submitBtnSell}`}
        onClick={!account ? connect : undefined}
        disabled={!!account || isConnecting}
      >
        {!account ? (isConnecting ? 'Connecting…' : 'Connect Wallet') : `${side === 'buy' ? 'Buy' : 'Sell'} ${sym}`}
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
          <button key={t.id} className={`${styles.bottomTab} ${activeTab === t.id ? styles.bottomTabActive : ''}`} onClick={() => setActiveTab(t.id)}>
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
  const { account, isConnecting, connect } = useWallet()
  const { prices, balances }               = useAppData()

  const [selectedSym, setSelectedSym] = useState('BTC')
  const [mobileTab,   setMobileTab]   = useState('chart')
  const [search,      setSearch]      = useState('')

  /* Merge live prices into market list */
  const markets = useMemo(() =>
    MARKET_META.map((m) => ({
      ...m,
      price:    fmtPrice(m.sym, prices[m.sym]),
      rawPrice: prices[m.sym] || 0,
    })),
  [prices])

  const market     = markets.find((m) => m.sym === selectedSym) || markets[0]
  const midPrice   = market.rawPrice
  const availUsdc  = balances?.USDC != null ? balances.USDC.toLocaleString('en-US', { maximumFractionDigits: 2 }) : null

  return (
    <div className={styles.page}>

      {/* ── Pair bar ────────────────────────────────────────────────────── */}
      <header className={styles.pairBar}>
        <button className={styles.pairSelector}>
          <div className={styles.pairSymDot} data-sym={market.sym} />
          <span className={styles.pairName}>{market.sym}/USDT</span>
          <ChevronDown size={14} className={styles.pairChevron} />
        </button>
        <div className={styles.pairDivider} />
        <div className={styles.pairPrice}>
          <span className={styles.pairPriceValue}>{market.price}</span>
        </div>
        <div className={styles.pairStats}>
          <div className={styles.pairStat}><span className={styles.statLabel}>24h High</span><span className={styles.statValue}>—</span></div>
          <div className={styles.pairStat}><span className={styles.statLabel}>24h Low</span><span className={styles.statValue}>—</span></div>
          <div className={styles.pairStat}><span className={styles.statLabel}>24h Vol ({market.sym})</span><span className={styles.statValue}>—</span></div>
          <div className={styles.pairStat}><span className={styles.statLabel}>24h Vol (USDT)</span><span className={styles.statValue}>—</span></div>
        </div>
      </header>

      {/* ── Desktop layout ───────────────────────────────────────────────── */}
      <div className={styles.desktopBody}>
        <Watchlist
          markets={markets}
          selected={selectedSym}
          onSelect={setSelectedSym}
          search={search}
          onSearch={setSearch}
        />
        <div className={styles.centerCol}>
          <ChartPlaceholder sym={market.sym} midPrice={midPrice} />
        </div>
        <div className={styles.rightCol}>
          <OrderBook sym={market.sym} midPrice={midPrice} />
          <div className={styles.rightDivider} />
          <OrderForm
            sym={market.sym}
            availUsdc={availUsdc}
            account={account}
            connect={connect}
            isConnecting={isConnecting}
          />
        </div>
      </div>

      {/* ── Bottom panel (desktop) ───────────────────────────────────────── */}
      <BottomPanel />

      {/* ── Mobile layout ────────────────────────────────────────────────── */}
      <div className={styles.mobileLayout}>
        <div className={styles.mobilePairBar}>
          <div className={styles.mobilePairLeft}>
            <button className={styles.mobilePairSelector}>
              <span className={styles.mobilePairName}>{market.sym}/USDT</span>
              <ChevronDown size={13} />
            </button>
            <span className={styles.mobilePairPrice}>{market.price}</span>
          </div>
          <div className={styles.mobilePairRight}>
            <span className={styles.mobilePairChange} style={{ color: 'var(--color-text-tertiary)' }}>—</span>
          </div>
        </div>

        <div className={styles.mobileTabs}>
          {[
            { id: 'chart',     label: 'Chart'     },
            { id: 'trade',     label: 'Trade'     },
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

        <div className={styles.mobileContent}>
          {mobileTab === 'chart' && (
            <div className={styles.mobileChartTab}>
              <div className={styles.mobileChartWrap}>
                <ChartPlaceholder sym={market.sym} midPrice={midPrice} />
              </div>
            </div>
          )}
          {mobileTab === 'trade' && (
            <div className={styles.mobileTradeTab}>
              <OrderForm
                sym={market.sym}
                availUsdc={availUsdc}
                account={account}
                connect={connect}
                isConnecting={isConnecting}
              />
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
