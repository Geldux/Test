/* Apply saved theme before first paint — prevents flash */
;(function () {
  try {
    const s = localStorage.getItem('geldux-theme') || 'dark'
    document.documentElement.classList.add(s === 'light' ? 'light' : 'dark')
  } catch (_) {
    document.documentElement.classList.add('dark')
  }
})()

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ToastContainer } from '@/components/Toast'
import App from '@/App'
import '@/index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastContainer />
    <App />
  </StrictMode>
)
