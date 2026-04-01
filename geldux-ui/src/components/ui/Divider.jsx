import styles from './Divider.module.css'

export default function Divider({ className = '', label }) {
  if (label) {
    return (
      <div className={`${styles.labeledDivider} ${className}`} role="separator">
        <span className={styles.line} />
        <span className={styles.label}>{label}</span>
        <span className={styles.line} />
      </div>
    )
  }

  return <hr className={`${styles.divider} ${className}`} />
}
