/**
 * useHistory — progressive on-chain event history for the connected wallet.
 *
 * Futures/perp coverage:
 *   PerpCore.Opened                  — isolated open
 *   PerpCore.Closed                  — isolated close (matched to user via posId)
 *   CrossMargin.PositionOpened       — cross open
 *   CrossMargin.PositionClosed       — cross close
 *   CrossMargin.PositionIncreased    — cross collateral add
 *   CrossMargin.Deposited            — cross margin deposit
 *   CrossMargin.Withdrawn            — cross margin withdrawal
 *   OrderManager.OrderCreated        — limit / SL / TP placed
 *   OrderManager.OrderCancelled      — order cancelled
 *
 * NOT trackable from events:
 *   PerpCore isolated increases — increaseWithPermitAndPriceUpdate emits no event.
 *   OrderExecuted               — only indexes the keeper address, not the trader.
 *
 * Closed events carry no owner arg and are matched client-side against posIds
 * found in accumulated Opened events.  The wide MAX_LOOKBACK window (~11.5 days)
 * ensures opens and closes that straddle a day boundary are both captured.
 *
 * Loading strategy:
 *   Start at the most recent BATCH_BLOCKS window, publish results after each
 *   batch so the UI updates incrementally, then extend backward until
 *   MAX_LOOKBACK blocks are exhausted.  No early-stop — always scans the full
 *   window so older perp trades are not silently dropped.
 *
 * RPC safety:
 *   CHUNK_SIZE = 2 000 keeps each eth_getLogs call within the Alchemy free-tier
 *   limit.  CONCURRENCY = 5 fires five chunks per event type in parallel to
 *   reduce wall-clock time without overloading the RPC.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Contract } from 'ethers'
import {
  ADDRESSES, ABI_PERP_CORE, ABI_CROSS_MARGIN, ABI_ORDER_MANAGER,
} from '@/config/contracts'
import { MARKETS } from '@/config/markets'
import { getReadProvider } from './useWallet'

export const BASESCAN_TX = 'https://sepolia.basescan.org/tx/'

const CHUNK_SIZE  = 2_000    /* blocks per eth_getLogs call */
const CONCURRENCY = 5        /* parallel chunks per event type per batch */
const BATCH_BLOCKS = 20_000  /* blocks per progressive pass (~11 h) */
const MAX_LOOKBACK = 500_000 /* hard cap (~11.5 days on Base Sepolia at 2 s/block) */

/**
 * Fetch all matching events between fromBlock and toBlock.
 * Splits the range into CHUNK_SIZE slices; up to CONCURRENCY slices are
 * fetched in parallel.  Failed slices are skipped; successful ones accumulate.
 */
async function queryChunked(contract, filter, fromBlock, toBlock) {
  const out = []
  for (let lo = fromBlock; lo <= toBlock; lo += CHUNK_SIZE * CONCURRENCY) {
    const batch = []
    for (let i = 0; i < CONCURRENCY; i++) {
      const clo = lo + i * CHUNK_SIZE
      if (clo > toBlock) break
      const chi = Math.min(clo + CHUNK_SIZE - 1, toBlock)
      batch.push(
        contract.queryFilter(filter, clo, chi).catch((e) => {
          console.warn('[useHistory] chunk query failed:', e?.message ?? e)
          return []
        })
      )
    }
    const results = await Promise.all(batch)
    results.forEach((r) => out.push(...r))
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

/** Build the unified sorted entry list from all accumulated event sets. */
function buildEntries(acc, currentBlock) {
  const {
    opened, closedAll, deposited, withdrawn,
    xOpened, xClosed, xIncreased,
    ordersCreated, ordersCancelled,
  } = acc

  /* Match PerpCore Closed events to this user via accumulated Opened posIds */
  const userPosIds = new Set(opened.map((e) => e.args.posId.toString()))
  const closedMine = closedAll.filter((e) => userPosIds.has(e.args.posId.toString()))

  const all = []

  /* ── Isolated opens ────────────────────────────────────────────── */
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

  /* ── Isolated closes (matched to user's posIds) ────────────────── */
  closedMine.forEach((e) => {
    const { posId, pnl } = e.args
    const matched = opened.find((o) => o.args.posId.toString() === posId.toString())
    all.push({
      type: 'close', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym:       matched ? symFromKey(matched.args.key) : '?',
      isLong:    matched ? matched.args.isLong : null,
      posId:     posId.toString(),
      leverage:  matched ? Number(matched.args.leverage) : null,
      collateral: matched ? Number(matched.args.collateral) / 1e18 : null,
      size:      matched
        ? (Number(matched.args.collateral) / 1e18) * Number(matched.args.leverage)
        : null,
      pnl: Number(pnl) / 1e18, amount: null, label: null,
    })
  })

  /* ── Cross opens ───────────────────────────────────────────────── */
  xOpened.forEach((e) => {
    const { posId, key } = e.args
    all.push({
      type: 'cross_open', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: symFromKey(key), isLong: null, posId: posId.toString(),
      leverage: null, collateral: null, size: null, pnl: null, amount: null, label: null,
    })
  })

  /* ── Cross closes — payout ≠ PnL; stored as amount ────────────── */
  xClosed.forEach((e) => {
    const { posId, payout } = e.args
    const matched = xOpened.find((o) => o.args.posId.toString() === posId.toString())
    all.push({
      type: 'cross_close', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym:    matched ? symFromKey(matched.args.key) : '?',
      isLong: null, posId: posId.toString(),
      leverage: null, collateral: null, size: null,
      pnl: null, amount: Number(payout) / 1e18, label: null,
    })
  })

  /* ── Cross collateral adds (PositionIncreased) ─────────────────── */
  xIncreased.forEach((e) => {
    const { posId, extra } = e.args
    const matched = xOpened.find((o) => o.args.posId.toString() === posId.toString())
    all.push({
      type: 'cross_increase', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym:    matched ? symFromKey(matched.args.key) : '?',
      isLong: null, posId: posId.toString(),
      leverage: null, collateral: null, size: null,
      pnl: null, amount: Number(extra) / 1e18, label: null,
    })
  })

  /* ── Cross deposits ────────────────────────────────────────────── */
  deposited.forEach((e) => {
    all.push({
      type: 'deposit', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: '', isLong: null, posId: null,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: Number(e.args.amt) / 1e18, label: null,
    })
  })

  /* ── Cross withdrawals ─────────────────────────────────────────── */
  withdrawn.forEach((e) => {
    all.push({
      type: 'withdraw', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: '', isLong: null, posId: null,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: Number(e.args.amt) / 1e18, label: null,
    })
  })

  /* ── Orders created ────────────────────────────────────────────── */
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

  /* ── Orders cancelled ──────────────────────────────────────────── */
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

  /* Newest first */
  all.sort((a, b) => b.blockNumber - a.blockNumber)
  return all
}

/** Build summary metrics from all accumulated event sets. */
function buildSummary(acc) {
  const { opened, xOpened, closedAll, deposited, withdrawn, xClosed } = acc
  const userPosIds  = new Set(opened.map((e) => e.args.posId.toString()))
  const closedMine  = closedAll.filter((e) => userPosIds.has(e.args.posId.toString()))

  const realizedPnl      = closedMine.reduce((s, e) => s + Number(e.args.pnl) / 1e18, 0)
  const totalDeposits    = deposited.reduce((s, e)  => s + Number(e.args.amt) / 1e18, 0)
  const totalWithdrawals = withdrawn.reduce((s, e)  => s + Number(e.args.amt) / 1e18, 0)
  const totalVolume      = opened.reduce((s, e) => {
    return s + (Number(e.args.collateral) / 1e18) * Number(e.args.leverage)
  }, 0)

  return {
    tradeCount:       opened.length + xOpened.length,
    closedCount:      closedMine.length + xClosed.length,
    realizedPnl,
    totalDeposits,
    totalWithdrawals,
    totalVolume,
  }
}

export function useHistory(account) {
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const mountedRef            = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async () => {
    if (!account) { setEntries([]); setSummary(null); return }
    const rp = getReadProvider()
    if (!rp) { console.warn('[useHistory] no read provider'); return }

    setEntries([])
    setSummary(null)
    setLoading(true)

    try {
      const currentBlock = await rp.getBlockNumber()
      const limitBlock   = Math.max(0, currentBlock - MAX_LOOKBACK)

      const core     = new Contract(ADDRESSES.PERP_CORE,     ABI_PERP_CORE,     rp)
      const cross    = new Contract(ADDRESSES.CROSS_MARGIN,  ABI_CROSS_MARGIN,  rp)
      const orderMgr = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, rp)

      /* Accumulator grows across progressive batches */
      const acc = {
        opened: [], closedAll: [], deposited: [], withdrawn: [],
        xOpened: [], xClosed: [], xIncreased: [],
        ordersCreated: [], ordersCancelled: [],
      }

      let toBlock = currentBlock

      /* Scan the full MAX_LOOKBACK window without early-stopping.
       * Results are published after each batch so the UI shows entries
       * as they arrive.  Skipping the early-stop ensures older perp
       * trades are not silently dropped for active wallets. */
      while (toBlock > limitBlock) {
        if (!mountedRef.current) return

        const fromBlock = Math.max(limitBlock, toBlock - BATCH_BLOCKS + 1)

        /* All 9 event streams fetched in parallel, each internally
         * parallelised across CONCURRENCY chunks. */
        const [
          opened, closedAll,
          deposited, withdrawn,
          xOpened, xClosed, xIncreased,
          ordersCreated, ordersCancelled,
        ] = await Promise.all([
          queryChunked(core,     core.filters.Opened(null, account),              fromBlock, toBlock),
          queryChunked(core,     core.filters.Closed(),                            fromBlock, toBlock),
          queryChunked(cross,    cross.filters.Deposited(account),                fromBlock, toBlock),
          queryChunked(cross,    cross.filters.Withdrawn(account),                fromBlock, toBlock),
          queryChunked(cross,    cross.filters.PositionOpened(account),           fromBlock, toBlock),
          queryChunked(cross,    cross.filters.PositionClosed(account),           fromBlock, toBlock),
          queryChunked(cross,    cross.filters.PositionIncreased(account),        fromBlock, toBlock),
          queryChunked(orderMgr, orderMgr.filters.OrderCreated(null, account),   fromBlock, toBlock),
          queryChunked(orderMgr, orderMgr.filters.OrderCancelled(null, account), fromBlock, toBlock),
        ])

        if (!mountedRef.current) return

        acc.opened.push(...opened)
        acc.closedAll.push(...closedAll)
        acc.deposited.push(...deposited)
        acc.withdrawn.push(...withdrawn)
        acc.xOpened.push(...xOpened)
        acc.xClosed.push(...xClosed)
        acc.xIncreased.push(...xIncreased)
        acc.ordersCreated.push(...ordersCreated)
        acc.ordersCancelled.push(...ordersCancelled)

        setEntries(buildEntries(acc, currentBlock))
        setSummary(buildSummary(acc))

        toBlock = fromBlock - 1
      }
    } catch (e) {
      console.warn('[useHistory] load failed:', e?.message ?? e)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [account])

  useEffect(() => { load() }, [load])

  return { entries, summary, loading, reload: load }
}
