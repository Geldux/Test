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
        const [free, reserved, insurance, netPnl] = await Promise.all([
          vault.freeBalance(),
          vault.reservedCollateral(),
          vault.insuranceBalance(),
          vault.netPnl(),
        ])
        if (!alive) return
        setStats({
          freeBalance:      Number(free)      / 1e18,
          reservedCollateral: Number(reserved) / 1e18,
          insuranceBalance: Number(insurance)  / 1e18,
          netPnl:           Number(netPnl)     / 1e18,
        })
      } catch (_) {}
      finally { if (alive) setLoading(false) }
    }
    fetch()
    const id = setInterval(fetch, 15_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return { stats, loading }
}
