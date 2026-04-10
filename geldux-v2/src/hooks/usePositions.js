import { useState, useEffect, useCallback, useRef } from 'react'
import { Contract, formatUnits } from 'ethers'
import { ADDRESSES, ABI_PERP_STORE, ABI_ORDER_MANAGER, ABI_CROSS_MARGIN } from '@/config/contracts'
import { getReadProvider, getProvider, getAccount } from './useWallet'

export function usePositions(account) {
  const [positions,    setPositions]    = useState([])
  const [orders,       setOrders]       = useState([])
  const [crossAccount, setCrossAccount] = useState(null)
  const [loading,      setLoading]      = useState(false)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    const addr = account || getAccount()
    /* Prefer wallet provider (already authenticated) over cold read provider */
    const rp = getProvider() || getReadProvider()
    if (!addr || !rp) {
      setPositions([]); setOrders([]); setCrossAccount(null)
      return
    }
    setLoading(true)
    try {
      const store    = new Contract(ADDRESSES.PERP_STORE,    ABI_PERP_STORE,    rp)
      const orderMgr = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, rp)
      const cross    = new Contract(ADDRESSES.CROSS_MARGIN,  ABI_CROSS_MARGIN,  rp)

      const [posIdsRes, orderIdsRes, crossAccRes] = await Promise.allSettled([
        store.getUserPositions(addr),
        orderMgr.traderOrders(addr),
        cross.getAccount(addr),
      ])

      /* ── Isolated positions ─────────────────────────────────────────── */
      let posList = []
      if (posIdsRes.status === 'fulfilled' && posIdsRes.value?.length) {
        const ids     = posIdsRes.value
        const details = await Promise.allSettled(ids.map((id) => store.getPosition(id)))
        posList = details
          .map((r, i) => ({ posId: ids[i], r }))
          .filter(({ r }) =>
            r.status === 'fulfilled' &&
            r.value?.owner &&
            r.value.owner !== '0x0000000000000000000000000000000000000000'
          )
          .map(({ posId, r: { value: p } }) => ({
            id:           Number(posId),
            owner:        p.owner,
            assetKey:     p.assetKey,
            isLong:       p.isLong,
            reduceOnly:   p.reduceOnly,
            leverage:     Number(p.leverage),
            collateral:   Number(p.collateral) / 1e18,
            size:         Number(p.size) / 1e18,
            entryPrice:   Number(p.entryPrice) / 1e18,
            openTime:     Number(p.openTime),
            fundingEntry: Number(p.fundingEntry),
          }))
      }

      /* ── Orders ─────────────────────────────────────────────────────── */
      let orderList = []
      if (orderIdsRes.status === 'fulfilled' && orderIdsRes.value?.length) {
        const ids      = orderIdsRes.value
        const rawOrders = await Promise.allSettled(ids.map((id) => orderMgr.getOrder(id)))
        orderList = rawOrders
          .map((r) => (r.status === 'fulfilled' ? r.value : null))
          .filter((o) => o && o.active)
          .map((o) => ({
            id:           Number(o.id),
            assetKey:     o.assetKey,
            isLong:       o.isLong,
            leverage:     Number(o.leverage),
            collateral:   Number(o.collateral) / 1e18,
            triggerPrice: Number(o.triggerPrice) / 1e18,
            fractionBps:  Number(o.fractionBps),
            orderType:    Number(o.orderType),   /* 0=limit, 1=stopLoss, 2=takeProfit */
            posId:        Number(o.posId),
            triggerAbove: o.triggerAbove,
            active:       o.active,
            executionFee: Number(o.executionFee),
          }))
      }

      /* ── Cross-margin account ────────────────────────────────────────── */
      let crossAcc2 = null
      if (crossAccRes.status === 'fulfilled') {
        const [balance, posIds] = crossAccRes.value
        /* Fetch equity and maintenance margin in parallel */
        const [equityRes, mmRes] = await Promise.allSettled([
          cross.accountEquity(addr),
          cross.accountMM(addr),
        ])
        crossAcc2 = {
          balance:     Number(balance) / 1e18,
          posIds:      posIds.map((id) => Number(id)),
          equity:      equityRes.status === 'fulfilled' ? Number(equityRes.value) / 1e18 : 0,
          marginUsed:  mmRes.status === 'fulfilled'     ? Number(mmRes.value)     / 1e18 : 0,
          freeMargin:  equityRes.status === 'fulfilled' && mmRes.status === 'fulfilled'
            ? Math.max(0, Number(equityRes.value) / 1e18 - Number(mmRes.value) / 1e18)
            : 0,
        }
      }

      if (!mountedRef.current) return
      setPositions(posList)
      setOrders(orderList)
      setCrossAccount(crossAcc2)
    } catch (e) {
      console.error('[usePositions] refresh failed:', e?.message || e)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [account])

  useEffect(() => {
    mountedRef.current = true
    refresh()
    const id = setInterval(refresh, 5000)
    return () => { mountedRef.current = false; clearInterval(id) }
  }, [refresh])

  return { positions, orders, crossAccount, loading, refresh }
}
