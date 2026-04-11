import { useState, useEffect, useRef } from 'react'
import { Contract } from 'ethers'
import { HERMES_URL } from '@/config/chain'
import { MARKETS, PYTH_IDS } from '@/config/markets'
import { ADDRESSES, ABI_PERP_CONFIG, ABI_PYTH } from '@/config/contracts'
import { getReadProvider, getProvider } from './useWallet'

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
    const data = await res.json()
    const parsed = data?.parsed || []
    parsed.forEach((entry) => {
      const sym = Object.entries(PYTH_IDS).find(([, id]) => entry.id === id.slice(2))?.[0]
      if (!sym) return
      const { price, expo } = entry.price
      _prices[sym] = {
        price:       Number(price) * Math.pow(10, Number(expo)),
        publishTime: entry.price.publish_time,
      }
    })
    notify()
  } catch (_) {}
}

async function fetchOnChainData() {
  const rp = getReadProvider()
  if (!rp) return
  try {
    const cfg = new Contract(ADDRESSES.PERP_CONFIG, ABI_PERP_CONFIG, rp)
    await Promise.allSettled(
      MARKETS.map(async (m) => {
        try {
          const [markRaw, fundRaw] = await Promise.all([
            cfg.getMarkPrice(m.key, true),   /* forLong=true for mid-price reference */
            cfg.computeFundingRate(m.key),
          ])
          if (markRaw) {
            const mark = Number(markRaw) / 1e18
            if (mark > 0) _prices[m.sym] = { ..._prices[m.sym], mark }
          }
          _funding[m.sym] = Number(fundRaw) / 1e18
        } catch (_) {}
        try {
          const [lo, so] = await cfg.getOI(m.key)
          _oi[m.sym] = { longOI: Number(lo) / 1e18, shortOI: Number(so) / 1e18 }
        } catch (_) {}
      })
    )
    notify()
  } catch (_) {}
}

/* Cached VAA binary data for 1-sig trades */
let _vaaCache = { data: [], ts: 0 }

export async function fetchVaas(pythIds) {
  const now = Date.now()
  if (now - _vaaCache.ts < 8000 && _vaaCache.data.length) return _vaaCache.data
  const ids = pythIds.map((id) => `ids[]=${id}`).join('&')
  const res  = await fetch(`${HERMES_URL}/v2/updates/price/latest?${ids}&encoding=hex`)
  const data = await res.json()
  const vaas = (data?.binary?.data || []).map((d) => '0x' + d)
  _vaaCache = { data: vaas, ts: now }
  return vaas
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
