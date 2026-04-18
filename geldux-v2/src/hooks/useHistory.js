/**
 * useHistory — on-chain event history for the connected wallet.
 *
 * Loading strategy:
 *   1. If Supabase is configured, read cached rows and display them immediately.
 *   2. Scan only the block range newer than the latest cached block (incremental).
 *   3. Persist new on-chain events back to Supabase (fire-and-forget).
 *   4. Without Supabase, full on-chain scan up to MAX_LOOKBACK.
 *
 * Perp / futures coverage:
 *   PerpCore.Opened               — isolated open
 *   PerpCore.Closed               — isolated close (matched via posId)
 *   CrossMargin.Deposited         — cross margin deposit
 *   CrossMargin.Withdrawn         — cross margin withdrawal
 *   CrossMargin.PositionOpened    — cross open
 *   CrossMargin.PositionClosed    — cross close
 *   CrossMargin.PositionIncreased — cross collateral add
 *   OrderManager.OrderCreated     — limit / SL / TP placed
 *   OrderManager.OrderCancelled   — order cancelled
 *
 * NOT trackable from events (contract limitation):
 *   PerpCore isolated increases — increaseWithPermitAndPriceUpdate emits no event.
 *   OrderExecuted               — indexes the keeper, not the trader.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Contract } from 'ethers'
import {
  ADDRESSES, ABI_PERP_CORE, ABI_CROSS_MARGIN, ABI_ORDER_MANAGER,
} from '@/config/contracts'
import { MARKETS } from '@/config/markets'
import { getHistoryProvider } from './useWallet'
import { HAS_ALCHEMY_HISTORY } from '@/config/chain'
import {
  HAS_SUPABASE, readFromSupabase, writeToSupabase, buildSummaryFromEntries,
} from '@/services/historyService'

export { BASESCAN_TX } from '@/services/historyService'

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

/**
 * Build normalized entry objects from raw event accumulator.
 * posIdLookup resolves close events whose matching open lives in the
 * Supabase cache rather than the current scan window.
 *   posIdLookup shape: { [posId]: { sym, isLong, leverage, collateral } }
 */
function buildEntries(acc, currentBlock, posIdLookup = {}) {
  const {
    opened, closedAll, deposited, withdrawn,
    xOpened, xClosed, xIncreased,
    ordersCreated, ordersCancelled,
  } = acc

  const userPosIds = new Set([
    ...opened.map((e) => e.args.posId.toString()),
    ...Object.keys(posIdLookup),
  ])
  const closedMine = closedAll.filter((e) => userPosIds.has(e.args.posId.toString()))

  const all = []

  opened.forEach((e) => {
    const { posId, key, isLong, leverage, collateral } = e.args
    const col = Number(collateral) / 1e18
    all.push({
      type: 'open', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: symFromKey(key), isLong, posId: posId.toString(),
      leverage: Number(leverage), collateral: col, size: col * Number(leverage),
      pnl: null, amount: null, label: null,
    })
  })

  closedMine.forEach((e) => {
    const { posId, pnl } = e.args
    const posIdStr  = posId.toString()
    const fromAcc   = opened.find((o) => o.args.posId.toString() === posIdStr)
    const fromCache = posIdLookup[posIdStr]
    all.push({
      type: 'close', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym:        fromAcc ? symFromKey(fromAcc.args.key)       : (fromCache?.sym        ?? '?'),
      isLong:     fromAcc ? fromAcc.args.isLong                : (fromCache?.isLong     ?? null),
      posId:      posIdStr,
      leverage:   fromAcc ? Number(fromAcc.args.leverage)      : (fromCache?.leverage   ?? null),
      collateral: fromAcc ? Number(fromAcc.args.collateral) / 1e18 : (fromCache?.collateral ?? null),
      size: fromAcc
        ? (Number(fromAcc.args.collateral) / 1e18) * Number(fromAcc.args.leverage)
        : fromCache ? (fromCache.collateral ?? 0) * (fromCache.leverage ?? 1) : null,
      pnl: Number(pnl) / 1e18, amount: null, label: null,
    })
  })

  xOpened.forEach((e) => {
    const { posId, key } = e.args
    all.push({
      type: 'cross_open', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: symFromKey(key), isLong: null, posId: posId.toString(),
      leverage: null, collateral: null, size: null, pnl: null, amount: null, label: null,
    })
  })

  /* xClosed and xIncreased filters already include account — no posId filter needed */
  xClosed.forEach((e) => {
    const { posId, payout } = e.args
    const posIdStr  = posId.toString()
    const fromAcc   = xOpened.find((o) => o.args.posId.toString() === posIdStr)
    const fromCache = posIdLookup[posIdStr]
    all.push({
      type: 'cross_close', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: fromAcc ? symFromKey(fromAcc.args.key) : (fromCache?.sym ?? '?'),
      isLong: null, posId: posIdStr,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: Number(payout) / 1e18, label: null,
    })
  })

  xIncreased.forEach((e) => {
    const { posId, extra } = e.args
    const posIdStr  = posId.toString()
    const fromAcc   = xOpened.find((o) => o.args.posId.toString() === posIdStr)
    const fromCache = posIdLookup[posIdStr]
    all.push({
      type: 'cross_increase', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: fromAcc ? symFromKey(fromAcc.args.key) : (fromCache?.sym ?? '?'),
      isLong: null, posId: posIdStr,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: Number(extra) / 1e18, label: null,
    })
  })

  deposited.forEach((e) => {
    all.push({
      type: 'deposit', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: '', isLong: null, posId: null,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: Number(e.args.amt) / 1e18, label: null,
    })
  })

  withdrawn.forEach((e) => {
    all.push({
      type: 'withdraw', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: '', isLong: null, posId: null,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: Number(e.args.amt) / 1e18, label: null,
    })
  })

  ordersCreated.forEach((e) => {
    const { id, t: orderType } = e.args
    all.push({
      type: 'order_created', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: '', isLong: null, posId: null,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: null,
      label: ORDER_TYPE_LABEL[Number(orderType)] ?? 'Order', orderId: Number(id),
    })
  })

  ordersCancelled.forEach((e) => {
    const { id } = e.args
    all.push({
      type: 'order_cancelled', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: '', isLong: null, posId: null,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: null, label: 'Order', orderId: Number(id),
    })
  })

  all.sort((a, b) => b.blockNumber - a.blockNumber)
  return all
}

/* Merge two blockNumber-desc sorted arrays, deduplicated by hash+type */
function mergeEntries(cached, fresh) {
  const seen = new Set(cached.map((e) => `${e.hash}|${e.type}`))
  const out  = [...cached]
  for (const e of fresh) {
    if (!seen.has(`${e.hash}|${e.type}`)) out.push(e)
  }
  out.sort((a, b) => b.blockNumber - a.blockNumber)
  return out
}

function friendlyRpcError(msg) {
  if (!msg) return 'History unavailable — check network connection.'
  if (/rate.?limit|429|too many/i.test(msg))
    return 'RPC rate limit reached. Try again, or set VITE_PRIMARY_RPC in .env.local.'
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

    console.log(
      `[useHistory] starting load for ${account.slice(0, 8)}… | ` +
      `Supabase: ${HAS_SUPABASE} | dedicated RPC: ${HAS_ALCHEMY_HISTORY} | ` +
      `MAX_LOOKBACK: ${MAX_LOOKBACK.toLocaleString()} blocks`
    )

    setEntries([])
    setSummary(null)
    setError(null)
    setLoading(true)

    try {
      const currentBlock = await rp.getBlockNumber()

      /* ── Fast path: serve Supabase-cached history immediately ───── */
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
          /* Incremental scan — only fetch blocks newer than the cache */
          if (cached.latestBlock > 0) fromBlock = cached.latestBlock + 1
        }
      }

      if (!mountedRef.current) return

      /* Build posId lookup so incremental closes can be enriched from cache */
      const posIdLookup = {}
      for (const e of cachedEntries) {
        if ((e.type === 'open' || e.type === 'cross_open') && e.posId) {
          posIdLookup[e.posId] = {
            sym: e.sym, isLong: e.isLong, leverage: e.leverage, collateral: e.collateral,
          }
        }
      }

      if (import.meta.env.DEV) {
        console.log(
          `[useHistory] scanning ${fromBlock}–${currentBlock} for ${account.slice(0, 8)}…`,
          `(Supabase: ${HAS_SUPABASE}, dedicated RPC: ${HAS_ALCHEMY_HISTORY})`
        )
      }

      const core     = new Contract(ADDRESSES.PERP_CORE,     ABI_PERP_CORE,     rp)
      const cross    = new Contract(ADDRESSES.CROSS_MARGIN,  ABI_CROSS_MARGIN,  rp)
      const orderMgr = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, rp)

      const acc = {
        opened: [], closedAll: [], deposited: [], withdrawn: [],
        xOpened: [], xClosed: [], xIncreased: [],
        ordersCreated: [], ordersCancelled: [],
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
          opened, closedAll,
          deposited, withdrawn,
          xOpened, xClosed, xIncreased,
          ordersCreated, ordersCancelled,
        ] = await Promise.all([
          queryChunked(core,     core.filters.Opened(null, account),              batchFrom, toBlock, 'Opened'),
          queryChunked(core,     core.filters.Closed(),                            batchFrom, toBlock, 'Closed'),
          queryChunked(cross,    cross.filters.Deposited(account),                batchFrom, toBlock, 'Deposited'),
          queryChunked(cross,    cross.filters.Withdrawn(account),                batchFrom, toBlock, 'Withdrawn'),
          queryChunked(cross,    cross.filters.PositionOpened(account),           batchFrom, toBlock, 'PositionOpened'),
          queryChunked(cross,    cross.filters.PositionClosed(account),           batchFrom, toBlock, 'PositionClosed'),
          queryChunked(cross,    cross.filters.PositionIncreased(account),        batchFrom, toBlock, 'PositionIncreased'),
          queryChunked(orderMgr, orderMgr.filters.OrderCreated(null, account),   batchFrom, toBlock, 'OrderCreated'),
          queryChunked(orderMgr, orderMgr.filters.OrderCancelled(null, account), batchFrom, toBlock, 'OrderCancelled'),
        ])

        if (!mountedRef.current) return

        if (batchIndex === 1) {
          if (import.meta.env.DEV) {
            console.log('[useHistory] first batch results:', {
              opened: opened.length, closedAll: closedAll.length,
              deposited: deposited.length, xOpened: xOpened.length,
              ordersCreated: ordersCreated.length,
            })
          }
          const total = opened.length + deposited.length + xOpened.length + ordersCreated.length
          if (total === 0) {
            console.warn(
              '[useHistory] zero events in first batch — possible rate-limit.\n' +
              '  Set VITE_PRIMARY_RPC in .env.local for a dedicated RPC endpoint.'
            )
          }
        }

        acc.opened.push(...opened)
        acc.closedAll.push(...closedAll)
        acc.deposited.push(...deposited)
        acc.withdrawn.push(...withdrawn)
        acc.xOpened.push(...xOpened)
        acc.xClosed.push(...xClosed)
        acc.xIncreased.push(...xIncreased)
        acc.ordersCreated.push(...ordersCreated)
        acc.ordersCancelled.push(...ordersCancelled)

        /* Progressive display: rebuild from full accumulated acc after each batch */
        const freshEntries = buildEntries(acc, currentBlock, posIdLookup)
        setEntries(mergeEntries(cachedEntries, freshEntries))
        setSummary(buildSummaryFromEntries(mergeEntries(cachedEntries, freshEntries)))

        toBlock = batchFrom - 1
      }

      /* Persist new on-chain events to Supabase (fire-and-forget) */
      const finalFresh = buildEntries(acc, currentBlock, posIdLookup)
      if (finalFresh.length > 0) {
        writeToSupabase(finalFresh, account)
      } else {
        console.warn('[useHistory] scan complete — 0 new events found; Supabase write skipped')
      }

    } catch (e) {
      console.error('[useHistory] load failed:', e?.message ?? e)
      if (mountedRef.current) setError(friendlyRpcError(e?.message))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [account])

  useEffect(() => { load() }, [load])

  return { entries, summary, loading, error, reload: load }
}
