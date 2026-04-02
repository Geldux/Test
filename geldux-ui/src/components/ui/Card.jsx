import styles from './Card.module.css'

/**
 * Card — base surface container.
 *
 * Props:
 *   variant: 'default' | 'flat' | 'raised'
 *   padding: 'none' | 'sm' | 'md' | 'lg'
 *   as:      HTML tag to render (default 'div')
 */
export default function Card({
  children,
  className = '',
  variant = 'default',
  padding = 'md',
  as: Tag = 'div',
  ...props
}) {
  return (
    <Tag
      className={[
        styles.card,
        styles[`variant-${variant}`],
        styles[`padding-${padding}`],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({ children, className = '', actions }) {
  return (
    <div className={`${styles.cardHeader} ${className}`}>
      <div className={styles.cardHeaderContent}>{children}</div>
      {actions && <div className={styles.cardHeaderActions}>{actions}</div>}
    </div>
  )
}

export function CardTitle({ children, className = '' }) {
  return (
    <h3 className={`${styles.cardTitle} ${className}`}>{children}</h3>
  )
}

export function CardDescription({ children, className = '' }) {
  return (
    <p className={`${styles.cardDescription} ${className}`}>{children}</p>
  )
}
