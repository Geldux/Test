import { useState, useEffect, useCallback, useRef } from 'react'
import { Contract } from 'ethers'
import { ADDRESSES, ABI_PERP_STORE, ABI_ORDER_MANAGER, ABI_CROSS_MARGIN } from '@/config/contracts'
import { getReadProvider, getAccount } from './useWallet'

export function usePositions(account) {
  const [positions,    setPositions]    = useState([])
  const [orders,       setOrders]       = useState([])
  const [crossAccount, setCrossAccount] = useState(null)
  const [loading,      setLoading]      = useState(false)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    const addr = account || getAccount()
    const rp   = getReadProvider()
    if (!addr || !rp) {
      setPositions([]); setOrders([]); setCrossAccount(null)
      return
    }
    setLoading(true)
    try {
      const store   = new Contract(ADDRESSES.PERP_STORE,    ABI_PERP_STORE,    rp)
      const orderMgr = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, rp)
      const cross   = new Contract(ADDRESSES.CROSS_MARGIN,  ABI_CROSS_MARGIN,  rp)

      const [posIds, rawOrders, crossAcc] = await Promise.allSettled([
        store.getUserPositions(addr),
        orderMgr.getUserOrders(addr),
        cross.getAccount(addr),
      ])

      /* Fetch each position detail */
      let posList = []
      if (posIds.status === 'fulfilled' && posIds.value?.length) {
        const details = await Promise.allSettled(
          posIds.value.map((id) => store.getPosition(id))
        )
        posList = details
          .filter((r) => r.status === 'fulfilled' && r.value?.isOpen)
          .map((r) => {
            const p = r.value
            return {
              id:         Number(p.id),
              owner:      p.owner,
              key:        p.key,
              isLong:     p.isLong,
              leverage:   Number(p.leverage),
              collateral: Number(p.collateral) / 1e18,
              size:       Number(p.size) / 1e18,
              entryPrice: Number(p.entryPrice) / 1e18,
              openTime:   Number(p.openTime),
              isOpen:     p.isOpen,
            }
          })
      }

      let orderList = []
      if (rawOrders.status === 'fulfilled') {
        orderList = rawOrders.value
          .filter((o) => o.active)
          .map((o) => ({
            id:           Number(o.id),
            key:          o.key,
            isLong:       o.isLong,
            leverage:     Number(o.leverage),
            collateral:   Number(o.collateral) / 1e18,
            triggerPrice: Number(o.triggerPrice) / 1e18,
            orderType:    Number(o.orderType),  /* 0=limit, 1=sl, 2=tp */
            posId:        Number(o.posId),
            active:       o.active,
          }))
      }

      let crossAcc2 = null
      if (crossAcc.status === 'fulfilled') {
        const c = crossAcc.value
        crossAcc2 = {
          equity:         Number(c.equity) / 1e18,
          usedMargin:     Number(c.usedMargin) / 1e18,
          unrealizedPnl:  Number(c.unrealizedPnl) / 1e18,
          freeMargin:     Number(c.freeMargin) / 1e18,
        }
      }

      if (!mountedRef.current) return
      setPositions(posList)
      setOrders(orderList)
      setCrossAccount(crossAcc2)
    } catch (_) {}
    finally { if (mountedRef.current) setLoading(false) }
  }, [account])

  useEffect(() => {
    mountedRef.current = true
    refresh()
    const id = setInterval(refresh, 5000)
    return () => { mountedRef.current = false; clearInterval(id) }
  }, [refresh])

  return { positions, orders, crossAccount, loading, refresh }
}
