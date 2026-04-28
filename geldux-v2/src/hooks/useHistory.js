/**
 * useHistory — on-chain event history for the connected wallet (Geldux Perp V2).
 *
 * GelduxPerpCore events (all on ADDRESSES.CORE):
 *   IsolatedPositionOpened   — isolated open
 *   IsolatedPositionClosed   — isolated close
 *   CrossDeposited           — cross margin deposit
 *   CrossWithdrawn           — cross margin withdrawal
 *   CrossPositionOpened      — cross open
 *   CrossPositionClosed      — cross close
 *   CrossPositionIncreased   — cross size add (no trader index — filtered by known posIds)
 *
 * GelduxOrderRouter events (on ADDRESSES.ROUTER):
 *   OrderExecuted            — order executed by keeper
 *   OrderCancelled           — order cancelled by trader
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Contract } from 'ethers'
import {
  ADDRESSES, ABI_PERP_CORE, ABI_ROUTER,
} from '@/config/contracts'
import { USDC_DECIMALS } from '@/config/chain'
import { MARKETS } from '@/config/markets'
import { getHistoryProvider } from './useWallet'
import { HAS_ALCHEMY_HISTORY, HISTORY_RPC_LIST } from '@/config/chain'
import {
  HAS_SUPABASE, readFromSupabase, writeToSupabase, buildSummaryFromEntries,
} from '@/services/historyService'

export { BASESCAN_TX } from '@/services/historyService'

const D_USDC = 10 ** USDC_DECIMALS

const CHUNK_SIZE   = 1_000
const CONCURRENCY  = 1
const BATCH_BLOCKS = HAS_ALCHEMY_HISTORY ? 50_000  : 20_000
const MAX_LOOKBACK = HAS_ALCHEMY_HISTORY ? 500_000 : 100_000

async function queryChunked(contract, filter, fromBlock, toBlock, label) {
  const out = []
  let failCount = 0
  for (let lo = fromBlock; lo <= toBlock; lo += CHUNK_SIZE * CONCURRENCY) {
    const batch = []
    for (let i = 0; i < CONCURRENCY; i++) {
      const clo = lo + i * CHUNK_SIZE
      if (clo > toBlock) break
      const chi = Math.min(clo + CHUNK_SIZE - 1, toBlock)
      batch.push(
        contract.queryFilter(filter, clo, chi).catch((e) => {
          failCount++
          console.warn(`[useHistory] ${label ?? 'event'} chunk [${clo}-${chi}] failed:`, e?.message ?? e)
          return []
        })
      )
    }
    const results = await Promise.all(batch)
    results.forEach((r) => out.push(...r))
  }
  if (failCount > 0) {
    const total = Math.ceil((toBlock - fromBlock + 1) / CHUNK_SIZE)
    console.warn(`[useHistory] ${label}: ${failCount}/${total} chunks failed — partial results only`)
  }
  return out
}

const ORDER_TYPE_LABEL = { 0: 'Limit', 1: 'Stop-Loss', 2: 'Take-Profit' }

function symFromKey(key) {
  return MARKETS.find((m) => m.key === key)?.sym ?? '?'
}

function estimateTs(blockNumber, currentBlock) {
  return Math.floor(Date.now() / 1000) - (currentBlock - blockNumber) * 2
}

function buildEntries(acc, currentBlock, posIdLookup = {}) {
  const {
    opened, closed,
    deposited, withdrawn,
    xOpened, xClosed, xIncreased,
    ordersExecuted, ordersCancelled,
  } = acc

  /* Cross increase: no trader indexed — filter to only positions we opened */
  const knownPosIds = new Set([
    ...opened.map((e) => e.args.posId.toString()),
    ...xOpened.map((e) => e.args.posId.toString()),
    ...Object.keys(posIdLookup),
  ])
  const xIncreasedMine = xIncreased.filter((e) => knownPosIds.has(e.args.posId.toString()))

  const all = []

  opened.forEach((e) => {
    const { posId, market, isLong, sizeUsd, collateral } = e.args
    all.push({
      type: 'open', hash: e.transactionHash, status: 'confirmed', mode: 'isolated',
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: symFromKey(market), isLong, posId: posId.toString(),
      leverage: null,
      collateral: Number(collateral) / D_USDC,
      size: Number(sizeUsd) / D_USDC,
      pnl: null, amount: null, label: null, entryPrice: null,
    })
  })

  closed.forEach((e) => {
    const { posId, pnl, payout } = e.args
    const posIdStr  = posId.toString()
    const fromAcc   = opened.find((o) => o.args.posId.toString() === posIdStr)
    const fromCache = posIdLookup[posIdStr]
    all.push({
      type: 'close', hash: e.transactionHash, status: 'confirmed', mode: 'isolated',
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym:        fromAcc ? symFromKey(fromAcc.args.market) : (fromCache?.sym   ?? '?'),
      isLong:     fromAcc ? fromAcc.args.isLong              : (fromCache?.isLong ?? null),
      posId:      posIdStr,
      leverage:   null,
      collateral: fromAcc ? Number(fromAcc.args.collateral) / D_USDC : (fromCache?.collateral ?? null),
      size:       fromAcc ? Number(fromAcc.args.sizeUsd)    / D_USDC : (fromCache?.size ?? null),
      pnl:        Number(pnl)    / D_USDC,
      amount:     Number(payout) / D_USDC,
      label: null, entryPrice: null,
    })
  })

  xOpened.forEach((e) => {
    const { posId, market, isLong, sizeUsd } = e.args
    all.push({
      type: 'cross_open', hash: e.transactionHash, status: 'confirmed', mode: 'cross',
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: symFromKey(market), isLong, posId: posId.toString(),
      leverage: null, collateral: null, size: Number(sizeUsd) / D_USDC,
      pnl: null, amount: null, label: null, entryPrice: null,
    })
  })

  xClosed.forEach((e) => {
    const { posId, pnl } = e.args
    const posIdStr  = posId.toString()
    const fromAcc   = xOpened.find((o) => o.args.posId.toString() === posIdStr)
    const fromCache = posIdLookup[posIdStr]
    all.push({
      type: 'cross_close', hash: e.transactionHash, status: 'confirmed', mode: 'cross',
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym:    fromAcc ? symFromKey(fromAcc.args.market) : (fromCache?.sym ?? '?'),
      isLong: fromAcc ? fromAcc.args.isLong              : (fromCache?.isLong ?? null),
      posId:  posIdStr,
      leverage: null, collateral: null, size: null,
      pnl: Number(pnl) / D_USDC, amount: null, label: null, entryPrice: null,
    })
  })

  xIncreasedMine.forEach((e) => {
    const { posId, addedSize } = e.args
    const posIdStr  = posId.toString()
    const fromAcc   = xOpened.find((o) => o.args.posId.toString() === posIdStr)
    const fromCache = posIdLookup[posIdStr]
    all.push({
      type: 'cross_increase', hash: e.transactionHash, status: 'confirmed', mode: 'cross',
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym:    fromAcc ? symFromKey(fromAcc.args.market) : (fromCache?.sym ?? '?'),
      isLong: fromAcc ? fromAcc.args.isLong              : (fromCache?.isLong ?? null),
      posId:  posIdStr,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: Number(addedSize) / D_USDC, label: null, entryPrice: null,
    })
  })

  deposited.forEach((e) => {
    all.push({
      type: 'deposit', hash: e.transactionHash, status: 'confirmed', mode: 'cross',
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: '', isLong: null, posId: null,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: Number(e.args.amount) / D_USDC, label: null, entryPrice: null,
    })
  })

  withdrawn.forEach((e) => {
    all.push({
      type: 'withdraw', hash: e.transactionHash, status: 'confirmed', mode: 'cross',
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: '', isLong: null, posId: null,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: Number(e.args.amount) / D_USDC, label: null, entryPrice: null,
    })
  })

  ordersExecuted.forEach((e) => {
    const { market, nonce, orderType } = e.args
    all.push({
      type: 'order_created', hash: e.transactionHash, status: 'confirmed', mode: null,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: symFromKey(market), isLong: null, posId: null,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: null,
      label: ORDER_TYPE_LABEL[Number(orderType)] ?? 'Order', orderId: Number(nonce), entryPrice: null,
    })
  })

  ordersCancelled.forEach((e) => {
    const { nonce } = e.args
    all.push({
      type: 'order_cancelled', hash: e.transactionHash, status: 'confirmed', mode: null,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: '', isLong: null, posId: null,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: null, label: 'Order', orderId: Number(nonce), entryPrice: null,
    })
  })

  all.sort((a, b) => b.blockNumber - a.blockNumber)
  return all
}

function mergeEntries(cached, fresh) {
  const freshKeys = new Set(fresh.map((e) => `${e.hash}|${e.type}`))
  const out = [
    ...fresh,
    ...cached.filter((e) => !freshKeys.has(`${e.hash}|${e.type}`)),
  ]
  out.sort((a, b) => {
    const aPending = a.blockNumber === 0
    const bPending = b.blockNumber === 0
    if (aPending !== bPending) return aPending ? -1 : 1
    return b.blockNumber - a.blockNumber
  })
  return out
}

function friendlyRpcError(msg, hasDedicatedRpc) {
  if (!msg) return 'History unavailable — check network connection.'
  if (/rate.?limit|429|too many/i.test(msg))
    return hasDedicatedRpc
      ? 'Dedicated RPC rate limit reached — check your API plan limits and try again.'
      : 'Public RPC rate limited. Add VITE_PRIMARY_RPC to your Vercel environment variables and redeploy.'
  if (/could not detect|econnrefused|network/i.test(msg))
    return 'Network error — check your connection or RPC configuration.'
  if (/timeout|etimedout/i.test(msg))
    return 'RPC request timed out. Check your connection and try again.'
  if (/missing response|server error/i.test(msg))
    return 'RPC server error. Try again or switch to a different provider.'
  return 'History load failed — check browser console for details.'
}

export function useHistory(account) {
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const mountedRef             = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async () => {
    if (!account) { setEntries([]); setSummary(null); setError(null); return }

    const rp = getHistoryProvider()
    if (!rp) {
      setError('No RPC provider — set VITE_PRIMARY_RPC in .env.local.')
      return
    }

    const _rpcHint = (HISTORY_RPC_LIST[0] ?? 'none').replace(/\/v2\/[^/?#]+/, '/v2/***')
    console.log(
      `[useHistory] starting load for ${account.slice(0, 8)}… | ` +
      `Supabase: ${HAS_SUPABASE} | dedicated RPC: ${HAS_ALCHEMY_HISTORY} | ` +
      `RPC[0]: ${_rpcHint} | MAX_LOOKBACK: ${MAX_LOOKBACK.toLocaleString()} blocks`
    )

    setEntries([])
    setSummary(null)
    setError(null)
    setLoading(true)

    try {
      const currentBlock = await rp.getBlockNumber()

      let cachedEntries = []
      let fromBlock     = Math.max(0, currentBlock - MAX_LOOKBACK)

      if (HAS_SUPABASE) {
        const cached = await readFromSupabase(account)
        if (cached) {
          cachedEntries = cached.entries
          if (cachedEntries.length > 0 && mountedRef.current) {
            setEntries(cachedEntries)
            setSummary(buildSummaryFromEntries(cachedEntries))
          }
          if (cached.latestBlock > 0) fromBlock = cached.latestBlock + 1
        }
      }

      if (!mountedRef.current) return

      const posIdLookup = {}
      for (const e of cachedEntries) {
        if ((e.type === 'open' || e.type === 'cross_open') && e.posId) {
          posIdLookup[e.posId] = { sym: e.sym, isLong: e.isLong, leverage: e.leverage, collateral: e.collateral }
        }
      }

      const core   = new Contract(ADDRESSES.CORE,   ABI_PERP_CORE, rp)
      const router = new Contract(ADDRESSES.ROUTER,  ABI_ROUTER,    rp)

      const acc = {
        opened: [], closed: [], deposited: [], withdrawn: [],
        xOpened: [], xClosed: [], xIncreased: [],
        ordersExecuted: [], ordersCancelled: [],
      }

      let toBlock    = currentBlock
      let batchIndex = 0

      while (toBlock >= fromBlock) {
        if (!mountedRef.current) return

        const batchFrom = Math.max(fromBlock, toBlock - BATCH_BLOCKS + 1)
        batchIndex++

        if (import.meta.env.DEV) {
          console.log(`[useHistory] batch ${batchIndex}: blocks ${batchFrom}–${toBlock}`)
        }

        const [
          opened, closed,
          deposited, withdrawn,
          xOpened, xClosed, xIncreased,
          ordersExecuted, ordersCancelled,
        ] = await Promise.all([
          queryChunked(core, core.filters.IsolatedPositionOpened(null, account),  batchFrom, toBlock, 'IsolatedPositionOpened'),
          queryChunked(core, core.filters.IsolatedPositionClosed(null, account),  batchFrom, toBlock, 'IsolatedPositionClosed'),
          queryChunked(core, core.filters.CrossDeposited(account),                batchFrom, toBlock, 'CrossDeposited'),
          queryChunked(core, core.filters.CrossWithdrawn(account),                batchFrom, toBlock, 'CrossWithdrawn'),
          queryChunked(core, core.filters.CrossPositionOpened(null, account),     batchFrom, toBlock, 'CrossPositionOpened'),
          queryChunked(core, core.filters.CrossPositionClosed(null, account),     batchFrom, toBlock, 'CrossPositionClosed'),
          queryChunked(core, core.filters.CrossPositionIncreased(),               batchFrom, toBlock, 'CrossPositionIncreased'),
          queryChunked(router, router.filters.OrderExecuted(account),             batchFrom, toBlock, 'OrderExecuted'),
          queryChunked(router, router.filters.OrderCancelled(account),            batchFrom, toBlock, 'OrderCancelled'),
        ])

        if (!mountedRef.current) return

        if (batchIndex === 1 && import.meta.env.DEV) {
          console.log('[useHistory] first batch results:', {
            opened: opened.length, closed: closed.length,
            deposited: deposited.length, xOpened: xOpened.length,
            ordersExecuted: ordersExecuted.length,
          })
        }

        acc.opened.push(...opened)
        acc.closed.push(...closed)
        acc.deposited.push(...deposited)
        acc.withdrawn.push(...withdrawn)
        acc.xOpened.push(...xOpened)
        acc.xClosed.push(...xClosed)
        acc.xIncreased.push(...xIncreased)
        acc.ordersExecuted.push(...ordersExecuted)
        acc.ordersCancelled.push(...ordersCancelled)

        const freshEntries = buildEntries(acc, currentBlock, posIdLookup)
        setEntries(mergeEntries(cachedEntries, freshEntries))
        setSummary(buildSummaryFromEntries(mergeEntries(cachedEntries, freshEntries)))

        toBlock = batchFrom - 1
      }

      const finalFresh = buildEntries(acc, currentBlock, posIdLookup)
      if (finalFresh.length > 0) {
        writeToSupabase(finalFresh, account)
      }

    } catch (e) {
      console.error('[useHistory] load failed:', e?.message ?? e, '| dedicated RPC:', HAS_ALCHEMY_HISTORY)
      if (mountedRef.current) setError(friendlyRpcError(e?.message, HAS_ALCHEMY_HISTORY))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [account])

  useEffect(() => { load() }, [load])

  return { entries, summary, loading, error, reload: load }
}
