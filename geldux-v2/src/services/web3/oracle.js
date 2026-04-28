import { Contract } from 'ethers'
import { HERMES_URL } from '@/config/chain'
import { ADDRESSES, ABI_ORACLE } from '@/config/contracts'
import { MARKETS, PYTH_IDS } from '@/config/markets'

/** @param {string[]} ids  Pyth price feed IDs (hex, with 0x prefix) */
export async function fetchVaas(ids = Object.values(PYTH_IDS)) {
  const qs  = ids.map((id) => `ids[]=${id}`).join('&')
  const res  = await fetch(`${HERMES_URL}/v2/updates/price/latest?${qs}&encoding=hex`)
  if (!res.ok) throw new Error(`Hermes error ${res.status}`)
  const data = await res.json()
  return (data?.binary?.data || []).map((d) => '0x' + d)
}

export async function fetchPrices() {
  const qs  = Object.values(PYTH_IDS).map((id) => `ids[]=${id}`).join('&')
  const res  = await fetch(`${HERMES_URL}/v2/updates/price/latest?${qs}`)
  if (!res.ok) throw new Error(`Hermes error ${res.status}`)
  const data    = await res.json()
  const parsed  = data?.parsed || []
  const prices  = {}
  parsed.forEach((entry) => {
    const sym = Object.entries(PYTH_IDS).find(([, id]) => entry.id === id.slice(2))?.[0]
    if (!sym) return
    const { price, expo, publish_time } = entry.price
    prices[sym] = {
      price:       Number(price) * Math.pow(10, Number(expo)),
      publishTime: publish_time,
    }
  })
  return prices
}

/**
 * Returns { updateData, fee } ready for a price-update payable call.
 * Fee is read from GelduxOracle.getUpdateFee (not raw Pyth contract).
 */
export async function getPythUpdateArgs(signer, pythIds = Object.values(PYTH_IDS)) {
  const updateData = await fetchVaas(pythIds)
  const oracle     = new Contract(ADDRESSES.ORACLE, ABI_ORACLE, signer)
  const fee        = await oracle.getUpdateFee(updateData)
  return { updateData, fee }
}
