import { useState, useEffect, useRef } from 'react'
import { Contract } from 'ethers'
import { HERMES_URL } from '@/config/chain'
import { MARKETS, PYTH_IDS } from '@/config/markets'
import { ADDRESSES, ABI_PERP_CONFIG, ABI_PYTH } from '@/config/contracts'
import { getReadProvider } from './useWallet'

/* Module-level price cache — shared across hook instances */
const _prices   = {}   /* sym → { price, conf, publishTime } */
const _oi       = {}   /* sym → { longOI, shortOI } */
const _funding  = {}   /* sym → fundingRate (number) */
let   _listeners = []

function notify() { _listeners.forEach((fn) => fn({ ..._prices }, { ..._oi }, { ..._funding })) }

async function fetchHermesPrices() {
  const ids = Object.values(PYTH_IDS).map((id) => `ids[]=${id}`).join('&')
  const url = `${HERMES_URL}/v2/updates/price/latest?${ids}`
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) {
      console.warn('[usePrices] Hermes returned HTTP', res.status, '— prices not updated')
      return
    }
    const data = await res.json()
    const parsed = data?.parsed || []
    const now    = Math.floor(Date.now() / 1000)
    parsed.forEach((entry) => {
      const sym = Object.entries(PYTH_IDS).find(([, id]) => entry.id === id.slice(2))?.[0]
      if (!sym) return
      const { price, expo, publish_time } = entry.price
      const age = now - publish_time
      if (age > 60) console.warn(`[usePrices] ${sym} price is stale: ${age}s old (publishTime ${publish_time})`)
      _prices[sym] = {
        price:       Number(price) * Math.pow(10, Number(expo)),
        publishTime: publish_time,
      }
    })
    notify()
  } catch (e) {
    console.warn('[usePrices] Hermes fetch failed:', e?.message ?? e)
  }
}

async function fetchOnChainData() {
  const rp = getReadProvider()
  if (!rp) { console.warn('[usePrices] fetchOnChainData: no read provider'); return }
  try {
    const cfg = new Contract(ADDRESSES.PERP_CONFIG, ABI_PERP_CONFIG, rp)
    await Promise.allSettled(
      MARKETS.map(async (m) => {
        try {
          /* Fetch both directional mark prices in parallel.
             forLong=true  → price applied to long  positions (entry/PnL for longs)
             forLong=false → price applied to short positions (entry/PnL for shorts)
             If these differ the protocol has a bid/ask spread; we expose both so
             PositionsPanel can use the direction-matching price for accurate PnL. */
          const [markLongRaw, markShortRaw] = await Promise.all([
            cfg.getMarkPrice(m.key, true),
            cfg.getMarkPrice(m.key, false),
          ])
          const markLong  = markLongRaw  ? Number(markLongRaw)  / 1e18 : 0
          const markShort = markShortRaw ? Number(markShortRaw) / 1e18 : 0
          if (markLong > 0 || markShort > 0) {
            _prices[m.sym] = { ..._prices[m.sym], markLong, markShort }
            if (markLong > 0 && markShort > 0 && Math.abs(markLong - markShort) / markShort > 0.0001) {
              console.log(`[usePrices] ${m.sym} mark spread: long=${markLong.toFixed(6)} short=${markShort.toFixed(6)} diff=${((markLong - markShort) / markShort * 100).toFixed(4)}%`)
            }
          }
        } catch (e) {
          console.warn(`[usePrices] ${m.sym} getMarkPrice failed (likely stale on-chain Pyth):`, e?.message ?? e)
          /* getIndexPrice may use getPriceUnsafe internally — succeeds even when on-chain
             Pyth is stale (no active price updater on testnet between trades).
             We get a single price with no bid/ask spread, but it's better than leaving
             markLong/markShort at 0, which forces the UI to fall back to Hermes mid. */
          try {
            const indexRaw = await cfg.getIndexPrice(m.key)
            const index = indexRaw ? Number(indexRaw) / 1e18 : 0
            if (index > 0) {
              _prices[m.sym] = { ..._prices[m.sym], markLong: index, markShort: index }
              console.log(`[usePrices] ${m.sym} mark fallback → getIndexPrice: ${index.toFixed(6)} (no spread)`)
            }
          } catch (ie) {
            console.warn(`[usePrices] ${m.sym} getIndexPrice also failed:`, ie?.message ?? ie)
          }
        }
        try {
          const fundRaw = await cfg.computeFundingRate(m.key)
          _funding[m.sym] = Number(fundRaw) / 1e18
        } catch (e) {
          console.warn(`[usePrices] ${m.sym} funding fetch failed:`, e?.message ?? e)
        }
        try {
          const [lo, so] = await cfg.getOI(m.key)
          _oi[m.sym] = { longOI: Number(lo) / 1e18, shortOI: Number(so) / 1e18 }
        } catch (e) {
          console.warn(`[usePrices] ${m.sym} OI fetch failed:`, e?.message ?? e)
        }
      })
    )
    notify()
  } catch (e) {
    console.warn('[usePrices] fetchOnChainData outer failure:', e?.message ?? e)
  }
}

/* Cached VAA binary data — used only when fresh=false (non-trade paths) */
let _vaaCache = { data: [], ts: 0 }

/* fresh=true: always fetch a new VAA from Hermes (required for actual trade submission).
   fresh=false: reuse cached data if < 8 s old (cross StalePrice update retry only). */
export async function fetchVaas(pythIds, { fresh = false } = {}) {
  const now = Date.now()
  if (!fresh && now - _vaaCache.ts < 8000 && _vaaCache.data.length) return _vaaCache.data
  const ids = pythIds.map((id) => `ids[]=${id}`).join('&')
  const res  = await fetch(
    `${HERMES_URL}/v2/updates/price/latest?${ids}&encoding=hex`,
    { signal: AbortSignal.timeout(6000) }
  )
  if (!res.ok) throw new Error(`Hermes VAA fetch failed: HTTP ${res.status}`)
  const data = await res.json()
  const vaas = (data?.binary?.data || []).map((d) => '0x' + d)
  if (!vaas.length) throw new Error('Hermes returned empty VAA list — cannot update oracle price')
  _vaaCache = { data: vaas, ts: now }
  /* Sync the display price cache with the price embedded in this VAA so the
     entry preview and the actual on-chain entry price come from the same feed
     response.  getCurrentPrice() after fetchVaas returns this synced value. */
  const parsed = data?.parsed ?? []
  if (parsed.length > 0) {
    for (const entry of parsed) {
      const sym = Object.entries(PYTH_IDS).find(([, id]) => entry.id === id.slice(2))?.[0]
      if (!sym) continue
      const { price, expo, publish_time } = entry.price
      const priceNum = Number(price) * Math.pow(10, Number(expo))
      if (priceNum > 0) {
        _prices[sym] = { ..._prices[sym], price: priceNum, publishTime: publish_time }
      }
    }
    notify()
  }
  return vaas
}

/* Snapshot of module-level price cache for a single symbol.
   Used by useTrading for diagnostic logging at trade time. */
export function getCurrentPrice(sym) {
  return _prices[sym] ? { ..._prices[sym] } : null
}

export function usePrices() {
  const [prices,  setPrices]  = useState({ ..._prices })
  const [oi,      setOi]      = useState({ ..._oi })
  const [funding, setFunding] = useState({ ..._funding })
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const update = (p, o, f) => {
      if (!mountedRef.current) return
      setPrices({ ...p }); setOi({ ...o }); setFunding({ ...f })
    }
    _listeners.push(update)

    fetchHermesPrices()
    fetchOnChainData()
    const hermesInterval = setInterval(fetchHermesPrices,  8000)
    const chainInterval  = setInterval(fetchOnChainData,  15000)

    return () => {
      mountedRef.current = false
      _listeners = _listeners.filter((fn) => fn !== update)
      clearInterval(hermesInterval)
      clearInterval(chainInterval)
    }
  }, [])

  return { prices, oi, funding }
}
