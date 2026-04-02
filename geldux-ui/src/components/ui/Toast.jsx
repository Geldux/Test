import { useToast } from '@/contexts/ToastContext'
import styles from './Toast.module.css'

export default function Toaster() {
  const { toasts } = useToast()
  if (!toasts.length) return null
  return (
    <div className={styles.container} aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${styles[t.type]}`} role="status">
          {t.message}
        </div>
      ))}
    </div>
  )
}
