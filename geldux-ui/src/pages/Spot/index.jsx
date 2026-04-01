import { ChevronDown } from 'lucide-react'
import { Card, CardTitle, Button, Input, Badge, Divider } from '@/components/ui'
import styles from './Spot.module.css'

const ORDER_BOOK = {
  asks: [
    { price: '62,180.00', size: '0.142', total: '8,819.56' },
    { price: '62,165.00', size: '0.310', total: '19,271.15' },
    { price: '62,155.00', size: '0.085', total: '5,283.18' },
    { price: '62,148.00', size: '0.500', total: '31,074.00' },
    { price: '62,142.00', size: '0.220', total: '13,671.24' },
  ],
  bids: [
    { price: '62,138.00', size: '0.310', total: '19,262.78' },
    { price: '62,130.00', size: '0.420', total: '26,094.60' },
    { price: '62,118.00', size: '0.174', total: '10,808.53' },
    { price: '62,100.00', size: '0.640', total: '39,744.00' },
    { price: '62,085.00', size: '0.095', total: '5,898.08' },
  ],
}

export default function Spot() {
  return (
    <div className={styles.page}>
      {/* Pair selector */}
      <div className={styles.pairBar}>
        <button className={styles.pairSelector}>
          <span className={styles.pairName}>BTC / USDT</span>
          <ChevronDown size={15} />
        </button>
        <div className={styles.pairStats}>
          <div className={styles.pairStat}>
            <span className={styles.statLabel}>Last Price</span>
            <span className={`${styles.statValue} mono text-positive`}>62,140.00</span>
          </div>
          <div className={styles.pairStat}>
            <span className={styles.statLabel}>24h Change</span>
            <span className="mono text-positive" style={{ fontSize: 'var(--text-sm)' }}>+2.14%</span>
          </div>
          <div className={styles.pairStat}>
            <span className={styles.statLabel}>24h High</span>
            <span className="mono" style={{ fontSize: 'var(--text-sm)' }}>62,890.00</span>
          </div>
          <div className={styles.pairStat}>
            <span className={styles.statLabel}>24h Low</span>
            <span className="mono" style={{ fontSize: 'var(--text-sm)' }}>60,240.00</span>
          </div>
          <div className={styles.pairStat}>
            <span className={styles.statLabel}>24h Volume</span>
            <span className="mono text-muted" style={{ fontSize: 'var(--text-sm)' }}>$2.8B</span>
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        {/* Chart placeholder */}
        <Card className={styles.chart} padding="none">
          <div className={styles.chartInner}>
            <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
              Chart component — connect TradingView or your charting library here
            </span>
          </div>
        </Card>

        {/* Order book */}
        <Card padding="none" className={styles.orderBook}>
          <div className={styles.obHeader}>
            <CardTitle>Order Book</CardTitle>
            <Badge variant="default" size="sm">0.01</Badge>
          </div>

          <div className={styles.obSection}>
            <div className={styles.obLabels}>
              <span>Price (USDT)</span>
              <span>Size (BTC)</span>
              <span style={{ textAlign: 'right' }}>Total</span>
            </div>
            {ORDER_BOOK.asks.map((row, i) => (
              <div key={i} className={`${styles.obRow} ${styles.ask}`}>
                <span className="mono text-negative">{row.price}</span>
                <span className="mono">{row.size}</span>
                <span className="mono text-muted" style={{ textAlign: 'right' }}>{row.total}</span>
              </div>
            ))}

            <Divider label="62,140.00" className={styles.spread} />

            {ORDER_BOOK.bids.map((row, i) => (
              <div key={i} className={`${styles.obRow} ${styles.bid}`}>
                <span className="mono text-positive">{row.price}</span>
                <span className="mono">{row.size}</span>
                <span className="mono text-muted" style={{ textAlign: 'right' }}>{row.total}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Order form */}
        <Card className={styles.orderForm}>
          <div className={styles.sideTabs}>
            <button className={`${styles.sideTab} ${styles.buyTab}`}>Buy</button>
            <button className={`${styles.sideTab} ${styles.sellTab}`}>Sell</button>
          </div>

          <div className={styles.orderTypeTabs}>
            {['Limit', 'Market', 'Stop'].map((t) => (
              <button
                key={t}
                className={`${styles.orderTypeTab} ${t === 'Limit' ? styles.activeOrderType : ''}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className={styles.formFields}>
            <Input label="Price" trailing={<span style={{ fontSize: 'var(--text-xs)' }}>USDT</span>} placeholder="62,140.00" size="md" />
            <Input label="Amount" trailing={<span style={{ fontSize: 'var(--text-xs)' }}>BTC</span>} placeholder="0.00" size="md" />
            <div className={styles.percentRow}>
              {['25%', '50%', '75%', '100%'].map((p) => (
                <button key={p} className={styles.percentBtn}>{p}</button>
              ))}
            </div>
            <Input label="Total" trailing={<span style={{ fontSize: 'var(--text-xs)' }}>USDT</span>} placeholder="0.00" size="md" />
          </div>

          <div className={styles.balance}>
            <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>Available</span>
            <span className="mono" style={{ fontSize: 'var(--text-xs)' }}>12,480.00 USDT</span>
          </div>

          <Button variant="primary" size="lg" fullWidth>
            Place Buy Order
          </Button>
        </Card>
      </div>
    </div>
  )
}
