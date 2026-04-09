import { useState, useEffect, useCallback } from 'react'

function getInitial() {
  try {
    const s = localStorage.getItem('geldux-theme')
    if (s === 'light' || s === 'dark') return s
  } catch (_) {}
  return 'dark'
}

function apply(theme) {
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(theme)
  try { localStorage.setItem('geldux-theme', theme) } catch (_) {}
}

export function useTheme() {
  const [theme, setThemeState] = useState(getInitial)
  useEffect(() => { apply(theme) }, [theme])
  const toggle = useCallback(() =>
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return { theme, isDark: theme === 'dark', toggle }
}
