import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import { ADDRESSES, ABI_PERP_VAULT } from '@/config/contracts'
import { getReadProvider } from './useWallet'

export function useVaultStats() {
  const [stats,   setStats]   = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    async function fetch() {
      const rp = getReadProvider()
      if (!rp) return
      setLoading(true)
      try {
        const vault = new Contract(ADDRESSES.PERP_VAULT, ABI_PERP_VAULT, rp)
        const [freeRes, reservedRes] = await Promise.allSettled([
          vault.freeBalance(),
          vault.reservedCollateral(),
        ])
        if (freeRes.status === 'rejected')
          console.warn('[useVaultStats] freeBalance failed:', freeRes.reason?.message ?? freeRes.reason)
        if (reservedRes.status === 'rejected')
          console.warn('[useVaultStats] reservedCollateral failed:', reservedRes.reason?.message ?? reservedRes.reason)
        if (!alive) return
        if (freeRes.status === 'fulfilled' && reservedRes.status === 'fulfilled') {
          setStats({
            freeBalance:        Number(freeRes.value)     / 1e18,
            reservedCollateral: Number(reservedRes.value) / 1e18,
          })
        }
      } catch (e) {
        console.warn('[useVaultStats] fetch failed:', e?.message ?? e)
      } finally { if (alive) setLoading(false) }
    }
    fetch()
    const id = setInterval(fetch, 15_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return { stats, loading }
}
