import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import Card from './Card'
import styles from './StatCard.module.css'

/**
 * StatCard — KPI tile used on Dashboard/Portfolio.
 *
 * Props:
 *   label:   string
 *   value:   string
 *   change:  number  — percentage change (positive = up, negative = down)
 *   period:  string  — e.g. "24h", "7d"
 *   icon:    ReactNode
 *   mono:    boolean — render value in monospace font
 */
export default function StatCard({
  label,
  value,
  change,
  period = '24h',
  icon,
  mono = false,
  className = '',
}) {
  const direction =
    change === undefined ? 'neutral'
    : change > 0 ? 'up'
    : change < 0 ? 'down'
    : 'neutral'

  const ChangeIcon =
    direction === 'up' ? TrendingUp
    : direction === 'down' ? TrendingDown
    : Minus

  return (
    <Card className={`${styles.card} ${className}`} padding="md">
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        {icon && <span className={styles.iconSlot}>{icon}</span>}
      </div>
      <div className={`${styles.value} ${mono ? 'mono' : ''}`}>{value}</div>
      {change !== undefined && (
        <div className={`${styles.change} ${styles[direction]}`}>
          <ChangeIcon size={13} strokeWidth={2} />
          <span>
            {direction === 'up' ? '+' : ''}
            {change.toFixed(2)}%
          </span>
          <span className={styles.period}>{period}</span>
        </div>
      )}
    </Card>
  )
}
