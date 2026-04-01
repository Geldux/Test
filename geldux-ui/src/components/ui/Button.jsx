import styles from './Button.module.css'

/**
 * Button
 *
 * Props:
 *   variant: 'primary' | 'secondary' | 'ghost' | 'danger'
 *   size:    'sm' | 'md' | 'lg'
 *   loading: boolean
 *   icon:    ReactNode (leading icon)
 *   iconRight: ReactNode (trailing icon)
 *   fullWidth: boolean
 */
export default function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  fullWidth = false,
  disabled,
  ...props
}) {
  return (
    <button
      className={[
        styles.btn,
        styles[`variant-${variant}`],
        styles[`size-${size}`],
        fullWidth ? styles.fullWidth : '',
        loading ? styles.loading : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {!loading && icon && <span className={styles.iconSlot}>{icon}</span>}
      {children && <span>{children}</span>}
      {!loading && iconRight && <span className={styles.iconSlot}>{iconRight}</span>}
    </button>
  )
}
