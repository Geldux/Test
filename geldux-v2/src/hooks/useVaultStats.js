import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import { ADDRESSES, ABI_VAULT } from '@/config/contracts'
import { USDC_DECIMALS } from '@/config/chain'
import { getReadProvider } from './useWallet'

const D_USDC = 10 ** USDC_DECIMALS

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
        const vault = new Contract(ADDRESSES.VAULT, ABI_VAULT, rp)
        const [totalRes, insuranceRes, feeRes] = await Promise.allSettled([
          vault.totalBalance(),
          vault.insuranceFund(),
          vault.feeAccrued(),
        ])
        if (totalRes.status === 'rejected')
          console.warn('[useVaultStats] totalBalance failed:', totalRes.reason?.message ?? totalRes.reason)
        if (!alive) return
        if (totalRes.status === 'fulfilled') {
          setStats({
            totalBalance:  Number(totalRes.value)     / D_USDC,
            insuranceFund: insuranceRes.status === 'fulfilled' ? Number(insuranceRes.value) / D_USDC : null,
            feeAccrued:    feeRes.status        === 'fulfilled' ? Number(feeRes.value)        / D_USDC : null,
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
