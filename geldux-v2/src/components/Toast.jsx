import { useState, useCallback, useEffect, useRef } from 'react'

let _addToast = null

export function toast(msg, type = 'info', title = '') {
  _addToast?.({ msg, type, title, id: Date.now() + Math.random() })
}
toast.success = (msg, title) => toast(msg, 'success', title)
toast.error   = (msg, title) => toast(msg, 'error',   title)
toast.info    = (msg, title) => toast(msg, 'info',     title)

const ICONS = { success: '✓', error: '✕', info: 'ℹ' }

function ToastItem({ t, onRemove }) {
  useEffect(() => {
    const id = setTimeout(() => onRemove(t.id), 4500)
    return () => clearTimeout(id)
  }, [t.id, onRemove])
  return (
    <div className={`toast ${t.type}`} onClick={() => onRemove(t.id)} style={{ cursor: 'pointer' }}>
      <span className="toast-icon">{ICONS[t.type]}</span>
      <div className="toast-body">
        {t.title && <div className="toast-title">{t.title}</div>}
        <div className="toast-msg">{t.msg}</div>
      </div>
    </div>
  )
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([])
  const remove = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), [])
  _addToast = useCallback((t) => setToasts((p) => [...p.slice(-4), t]), [])
  if (!toasts.length) return null
  return (
    <div className="toast-container">
      {toasts.map((t) => <ToastItem key={t.id} t={t} onRemove={remove} />)}
    </div>
  )
}
