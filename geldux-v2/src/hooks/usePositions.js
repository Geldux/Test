import { useState, useEffect, useCallback, useRef } from 'react'
import { Contract } from 'ethers'
import { ADDRESSES, ABI_PERP_CORE } from '@/config/contracts'
import { MARKETS } from '@/config/markets'
import { USDC_DECIMALS, PRICE_DECIMALS } from '@/config/chain'
import { getReadProvider, getProvider, getAccount } from './useWallet'

const D_USDC  = 10 ** USDC_DECIMALS   /* 1e6  — collateral, balances, sizeUsd */
const D_PRICE = 10 ** PRICE_DECIMALS  /* 1e18 — entry/mark/liq prices */

function parsePosition(posId, p, liqPrice) {
  return {
    id:          Number(posId),
    isCross:     p.isCross,
    trader:      p.trader,
    market:      p.market,
    isLong:      p.isLong,
    sizeUsd:     Number(p.sizeUsd)    / D_USDC,
    collateral:  Number(p.collateral) / D_USDC,
    entryPrice:  Number(p.entryPrice) / D_PRICE,
    fundingEntry: p.fundingEntry,
    openedAt:    Number(p.openedAt),
    updatedAt:   Number(p.updatedAt),
    liqPrice:    liqPrice != null ? Number(liqPrice) / D_PRICE : null,
  }
}

export function usePositions(account) {
  const [positions,    setPositions]    = useState([])
  const [orders,       setOrders]       = useState([])
  const [crossAccount, setCrossAccount] = useState(null)
  const [loading,      setLoading]      = useState(false)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    const addr = account || getAccount()
    const rp   = getProvider() || getReadProvider()
    if (!addr || !rp) {
      setPositions([]); setOrders([]); setCrossAccount(null)
      return
    }
    setLoading(true)
    try {
      const core = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, rp)

      /* ── Cross account data ──────────────────────────────────────── */
      const [crossPosIdsRes, collateralRes, equityRes, freeMarginRes, usedMarginRes, mmRes] =
        await Promise.allSettled([
          core.getCrossPositions(addr),
          core.crossCollateral(addr),
          core.getCrossAccountEquity(addr),
          core.getCrossFreeMargin(addr),
          core.getCrossUsedMargin(addr),
          core.getCrossTotalMaintenanceMargin(addr),
        ])

      /* ── Cross positions ─────────────────────────────────────────── */
      let crossPosList = []
      if (crossPosIdsRes.status === 'fulfilled' && crossPosIdsRes.value?.length) {
        const ids     = crossPosIdsRes.value
        const details = await Promise.allSettled(ids.map((id) => core.getPosition(id)))
        crossPosList  = details
          .map((r, i) => ({ posId: ids[i], r }))
          .filter(({ r }) => r.status === 'fulfilled' && r.value?.isOpen)
          .map(({ posId, r: { value: p } }) => parsePosition(posId, p, null))
      }

      /* ── Isolated positions: probe each market × direction ────────── */
      const probeIds = MARKETS.flatMap((m) => [
        core.getPositionId(addr, m.key, true,  false),
        core.getPositionId(addr, m.key, false, false),
      ])
      const probeResults = await Promise.allSettled(probeIds)
      const validIds     = probeResults
        .map((r) => (r.status === 'fulfilled' ? r.value : 0n))
        .filter((id) => id > 0n)

      let isolatedPosList = []
      if (validIds.length) {
        const [detailResults, liqResults] = await Promise.all([
          Promise.allSettled(validIds.map((id) => core.getPosition(id))),
          Promise.allSettled(validIds.map((id) => core.getLiquidationPrice(id))),
        ])
        isolatedPosList = detailResults
          .map((r, i) => ({ posId: validIds[i], r, liq: liqResults[i] }))
          .filter(({ r }) => r.status === 'fulfilled' && r.value?.isOpen)
          .map(({ posId, r: { value: p }, liq }) =>
            parsePosition(posId, p, liq.status === 'fulfilled' ? liq.value : null)
          )
      }

      /* ── Cross account summary ───────────────────────────────────── */
      let crossAcc2 = null
      if (collateralRes.status === 'fulfilled') {
        crossAcc2 = {
          balance:           Number(collateralRes.value)  / D_USDC,
          posIds:            crossPosList.map((p) => p.id),
          equity:            equityRes.status    === 'fulfilled' ? Number(equityRes.value)    / D_USDC : null,
          freeMargin:        freeMarginRes.status === 'fulfilled' ? Number(freeMarginRes.value) / D_USDC : null,
          marginUsed:        usedMarginRes.status === 'fulfilled' ? Number(usedMarginRes.value) / D_USDC : null,
          maintenanceMargin: mmRes.status         === 'fulfilled' ? Number(mmRes.value)         / D_USDC : null,
        }
      }

      if (!mountedRef.current) return
      setPositions([...crossPosList, ...isolatedPosList])
      setOrders([])
      setCrossAccount(crossAcc2)
    } catch (e) {
      console.error('[usePositions] refresh failed:', e?.message ?? e)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [account])

  useEffect(() => {
    mountedRef.current = true
    refresh()
    const id = setInterval(refresh, 20000)
    return () => { mountedRef.current = false; clearInterval(id) }
  }, [refresh])

  return { positions, orders, crossAccount, loading, refresh }
}
