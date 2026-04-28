import { formatUnits } from 'ethers'
import { USDC_DECIMALS } from '@/config/chain'

/* ── Price ───────────────────────────────────────────────────────────── */
export function fmtPrice(raw, sym = '') {
  if (!raw) return '—'
  const n = typeof raw === 'bigint' ? Number(formatUnits(raw, 18)) : Number(raw)
  if (!isFinite(n)) return '—'
  if (sym === 'SOL' || n < 1000) return '$' + n.toFixed(4)
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtPriceRaw(n) {
  if (n == null) return '—'
  const v = Number(n)
  if (!isFinite(v)) return '—'
  if (v >= 10000) return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  if (v >= 100)   return '$' + v.toFixed(2)
  return '$' + v.toFixed(4)
}

/* ── USDC amounts (6-decimal BigInt or plain number) ──────────────────── */
export function fmtUsdc(raw) {
  if (raw == null) return '—'
  const n = typeof raw === 'bigint' ? Number(formatUnits(raw, USDC_DECIMALS)) : Number(raw)
  if (!isFinite(n)) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtUsdcCompact(raw) {
  if (raw == null) return '—'
  const n = typeof raw === 'bigint' ? Number(formatUnits(raw, USDC_DECIMALS)) : Number(raw)
  if (!isFinite(n)) return '—'
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(2) + 'K'
  return n.toFixed(2)
}

/* ── PnL ─────────────────────────────────────────────────────────────── */
export function fmtPnl(raw) {
  if (raw == null) return '—'
  const n = typeof raw === 'bigint' ? Number(formatUnits(raw, 18)) : Number(raw)
  if (!isFinite(n)) return '—'
  const sign = n >= 0 ? '+' : ''
  return sign + '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtPnlPct(entryPrice, markPrice, isLong, leverage) {
  if (!entryPrice || !markPrice) return '—'
  const e = Number(entryPrice), m = Number(markPrice)
  if (!e) return '—'
  const pct = isLong ? (m - e) / e * leverage * 100 : (e - m) / e * leverage * 100
  const sign = pct >= 0 ? '+' : ''
  return sign + pct.toFixed(2) + '%'
}

export function calcPnlUsd(entry, mark, isLong, sizeUsd) {
  if (!entry || !mark || !sizeUsd) return 0
  const e = Number(entry), m = Number(mark), s = Number(sizeUsd)
  return isLong ? (m - e) / e * s : (e - m) / e * s
}

/* ── OI ──────────────────────────────────────────────────────────────── */
export function fmtOI(raw) {
  if (raw == null) return '—'
  const n = typeof raw === 'bigint' ? Number(formatUnits(raw, 18)) : Number(raw)
  if (!isFinite(n)) return '—'
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

/* ── Funding rate (per-hour display) ─────────────────────────────────── */
export function fmtFunding(raw) {
  if (raw == null) return '—'
  const n = typeof raw === 'bigint' ? Number(formatUnits(raw, 18)) : Number(raw)
  if (!isFinite(n)) return '—'
  const pct = n * 100
  const sign = pct >= 0 ? '+' : ''
  return sign + pct.toFixed(4) + '%/hr'
}

/* ── Leverage ─────────────────────────────────────────────────────────── */
export function fmtLev(n) {
  return n + 'x'
}

/* ── Addresses ───────────────────────────────────────────────────────── */
export function truncAddr(addr) {
  if (!addr) return ''
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

/* ── PnL CSS class ───────────────────────────────────────────────────── */
export function pnlClass(n) {
  const v = Number(n)
  if (v > 0) return 'pos'
  if (v < 0) return 'neg'
  return ''
}

/* ── Liq price estimate (rough) ──────────────────────────────────────── */
export function estLiqPrice(entryPrice, leverage, isLong) {
  if (!entryPrice || !leverage) return null
  const e = Number(entryPrice)
  const margin = 0.9 / leverage
  return isLong ? e * (1 - margin) : e * (1 + margin)
}

/* ── Age ─────────────────────────────────────────────────────────────── */
export function fmtAge(openTimeSec) {
  if (!openTimeSec) return '—'
  const s = Math.floor(Date.now() / 1000) - Number(openTimeSec)
  if (s < 60)   return s + 's'
  if (s < 3600) return Math.floor(s / 60) + 'm'
  if (s < 86400) return Math.floor(s / 3600) + 'h'
  return Math.floor(s / 86400) + 'd'
}
