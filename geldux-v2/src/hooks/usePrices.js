import { useState, useEffect, useRef } from 'react'
import { Contract } from 'ethers'
import { HERMES_URL } from '@/config/chain'
import { MARKETS, PYTH_IDS } from '@/config/markets'
import { ADDRESSES, ABI_ORACLE, ABI_PERP_CORE } from '@/config/contracts'
import { getReadProvider } from './useWallet'

/* Module-level price cache — shared across hook instances */
const _prices   = {}   /* sym → { price, markLong, markShort, publishTime } */
const _oi       = {}   /* sym → { longOI, shortOI } */
const _funding  = {}   /* sym → fundingRate (number, 1e18-scaled per day) */
let   _listeners = []

function notify() { _listeners.forEach((fn) => fn({ ..._prices }, { ..._oi }, { ..._funding })) }

async function fetchHermesPrices() {
  const ids = Object.values(PYTH_IDS).map((id) => `ids[]=${id}`).join('&')
  const url = `${HERMES_URL}/v2/updates/price/latest?${ids}`
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) {
      console.warn('[usePrices] Hermes returned HTTP', res.status)
      return
    }
    const data   = await res.json()
    const parsed = data?.parsed || []
    const now    = Math.floor(Date.now() / 1000)
    parsed.forEach((entry) => {
      const sym = Object.entries(PYTH_IDS).find(([, id]) => entry.id === id.slice(2))?.[0]
      if (!sym) return
      const { price, expo, publish_time } = entry.price
      const age = now - publish_time
      if (age > 60) console.warn(`[usePrices] ${sym} Hermes price stale: ${age}s`)
      _prices[sym] = {
        ..._prices[sym],
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
    const oracle = new Contract(ADDRESSES.ORACLE, ABI_ORACLE,    rp)
    const core   = new Contract(ADDRESSES.CORE,   ABI_PERP_CORE, rp)

    await Promise.allSettled(
      MARKETS.map(async (m) => {
        /* Price from GelduxOracle */
        try {
          const { price, publishTime } = await oracle.getPriceUnsafe(m.key)
          const priceNum = Number(price) / 1e18
          if (priceNum > 0) {
            _prices[m.sym] = {
              ..._prices[m.sym],
              markLong:    priceNum,
              markShort:   priceNum,
              publishTime: Number(publishTime),
            }
          }
        } catch (e) {
          console.warn(`[usePrices] ${m.sym} oracle.getPriceUnsafe failed:`, e?.message ?? e)
          try {
            const priceRaw = await oracle.getPrice(m.key)
            const priceNum = Number(priceRaw) / 1e18
            if (priceNum > 0) {
              _prices[m.sym] = { ..._prices[m.sym], markLong: priceNum, markShort: priceNum }
            }
          } catch (e2) {
            console.warn(`[usePrices] ${m.sym} oracle.getPrice also failed:`, e2?.message ?? e2)
          }
        }

        /* OI and funding from GelduxPerpCore.getMarket */
        try {
          const mkt = await core.getMarket(m.key)
          _oi[m.sym] = {
            longOI:  Number(mkt.longOI)  / 1e6,
            shortOI: Number(mkt.shortOI) / 1e6,
          }
          _funding[m.sym] = Number(mkt.fundingRate) / 1e18
        } catch (e) {
          console.warn(`[usePrices] ${m.sym} core.getMarket failed:`, e?.message ?? e)
        }
      })
    )
    notify()
  } catch (e) {
    console.warn('[usePrices] fetchOnChainData outer failure:', e?.message ?? e)
  }
}

/* Cached VAA binary data — used when fresh=false (non-trade paths) */
let _vaaCache = { data: [], ts: 0 }

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
  if (!vaas.length) throw new Error('Hermes returned empty VAA list')
  _vaaCache = { data: vaas, ts: now }
  /* Sync display prices with the prices embedded in this VAA */
  const parsed = data?.parsed ?? []
  for (const entry of parsed) {
    const sym = Object.entries(PYTH_IDS).find(([, id]) => entry.id === id.slice(2))?.[0]
    if (!sym) continue
    const { price, expo, publish_time } = entry.price
    const priceNum = Number(price) * Math.pow(10, Number(expo))
    if (priceNum > 0) {
      _prices[sym] = { ..._prices[sym], price: priceNum, publishTime: publish_time }
    }
  }
  if (parsed.length > 0) notify()
  return vaas
}

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
