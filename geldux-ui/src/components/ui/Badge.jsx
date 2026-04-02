import styles from './Badge.module.css'

/**
 * Badge — inline status/label chip.
 *
 * Props:
 *   variant: 'default' | 'accent' | 'success' | 'danger' | 'warning' | 'neutral'
 *   size:    'sm' | 'md'
 *   dot:     boolean — show a colored dot prefix
 */
export default function Badge({
  children,
  className = '',
  variant = 'default',
  size = 'md',
  dot = false,
}) {
  return (
    <span
      className={[
        styles.badge,
        styles[`variant-${variant}`],
        styles[`size-${size}`],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  )
}
