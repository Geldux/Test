/**
 * useHistory — progressive on-chain event history for the connected wallet.
 *
 * Loading strategy:
 *   1. Start with the most recent BATCH_BLOCKS blocks.
 *   2. After each batch, publish results to the UI so the user sees data
 *      arriving incrementally.
 *   3. If fewer than ENOUGH_RESULTS entries found after 2+ batches, extend
 *      backward by another BATCH_BLOCKS and repeat.
 *   4. Hard-stop at MAX_LOOKBACK blocks (~2.3 days on Base Sepolia).
 *
 * Cross-batch matching:
 *   Closed events carry no owner arg — they are matched against all Opened
 *   events accumulated so far.  The match improves as older batches load.
 *
 * RPC limits:
 *   CHUNK_SIZE = 2 000 blocks per eth_getLogs request.  Safe for Alchemy free
 *   tier, Growth tier, and public Base nodes.  BATCH_BLOCKS = 20 000 groups
 *   10 chunks per progressive pass.
 *
 * Timestamps are estimated at ~2 s/block (Base Sepolia). Accuracy ±minutes.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Contract } from 'ethers'
import {
  ADDRESSES, ABI_PERP_CORE, ABI_CROSS_MARGIN, ABI_ORDER_MANAGER,
} from '@/config/contracts'
import { MARKETS } from '@/config/markets'
import { getReadProvider } from './useWallet'

export const BASESCAN_TX = 'https://sepolia.basescan.org/tx/'

const CHUNK_SIZE     = 2_000    /* max blocks per eth_getLogs call */
const BATCH_BLOCKS   = 20_000   /* blocks per progressive pass (~11 h) */
const MAX_LOOKBACK   = 100_000  /* hard cap (~2.3 days on Base Sepolia at 2 s/block) */
const ENOUGH_RESULTS = 10       /* stop early if 2+ batches done AND this many entries found */

/* Fetch one event type across [fromBlock, toBlock] in safe-sized chunks.
 * Individual chunk failures are swallowed; successful chunks accumulate. */
async function queryChunked(contract, filter, fromBlock, toBlock) {
  const out = []
  for (let lo = fromBlock; lo <= toBlock; lo += CHUNK_SIZE) {
    const hi = Math.min(lo + CHUNK_SIZE - 1, toBlock)
    try {
      const chunk = await contract.queryFilter(filter, lo, hi)
      out.push(...chunk)
    } catch (e) {
      console.warn('[useHistory] chunk query failed:', e?.message ?? e)
    }
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

/* Build the unified sorted entry list from the accumulated event sets. */
function buildEntries(acc, currentBlock) {
  const { opened, closedAll, deposited, withdrawn, xOpened, xClosed,
          ordersCreated, ordersCancelled } = acc

  /* Match Closed events to this user's posIds using the full opened set */
  const userPosIds  = new Set(opened.map((e) => e.args.posId.toString()))
  const closedMine  = closedAll.filter((e) => userPosIds.has(e.args.posId.toString()))

  const all = []

  /* Isolated opens */
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

  /* Isolated closes */
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

  /* Cross opens */
  xOpened.forEach((e) => {
    const { posId, key } = e.args
    all.push({
      type: 'cross_open', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: symFromKey(key), isLong: null, posId: posId.toString(),
      leverage: null, collateral: null, size: null, pnl: null, amount: null, label: null,
    })
  })

  /* Cross closes — payout ≠ PnL; stored as amount */
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

  /* Deposits */
  deposited.forEach((e) => {
    all.push({
      type: 'deposit', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: '', isLong: null, posId: null,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: Number(e.args.amt) / 1e18, label: null,
    })
  })

  /* Withdrawals */
  withdrawn.forEach((e) => {
    all.push({
      type: 'withdraw', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: '', isLong: null, posId: null,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: Number(e.args.amt) / 1e18, label: null,
    })
  })

  /* Orders created */
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

  /* Orders cancelled */
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

/* Build summary metrics from the accumulated event sets. */
function buildSummary(acc) {
  const { opened, xOpened, closedAll, deposited, withdrawn } = acc
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
    closedCount:      closedMine.length + acc.xClosed.length,
    realizedPnl,
    totalDeposits,
    totalWithdrawals,
    totalVolume,
  }
}

export function useHistory(account) {
  const [entries, setEntries]   = useState([])
  const [summary, setSummary]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const mountedRef              = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async () => {
    if (!account) { setEntries([]); setSummary(null); return }
    const rp = getReadProvider()
    if (!rp) { console.warn('[useHistory] no read provider'); return }

    /* Reset on each reload so stale data doesn't linger while loading */
    setEntries([])
    setSummary(null)
    setLoading(true)

    try {
      const currentBlock = await rp.getBlockNumber()
      const limitBlock   = Math.max(0, currentBlock - MAX_LOOKBACK)

      const core     = new Contract(ADDRESSES.PERP_CORE,     ABI_PERP_CORE,     rp)
      const cross    = new Contract(ADDRESSES.CROSS_MARGIN,  ABI_CROSS_MARGIN,  rp)
      const orderMgr = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, rp)

      /* Accumulator — grows across batches */
      const acc = {
        opened: [], closedAll: [], deposited: [], withdrawn: [],
        xOpened: [], xClosed: [], ordersCreated: [], ordersCancelled: [],
      }

      let toBlock     = currentBlock
      let batchesDone = 0

      while (toBlock > limitBlock) {
        if (!mountedRef.current) return

        const fromBlock = Math.max(limitBlock, toBlock - BATCH_BLOCKS + 1)

        /* Fetch all 8 event streams for this batch in parallel */
        const [
          opened, closedAll,
          deposited, withdrawn,
          xOpened, xClosed,
          ordersCreated, ordersCancelled,
        ] = await Promise.all([
          queryChunked(core,     core.filters.Opened(null, account),              fromBlock, toBlock),
          queryChunked(core,     core.filters.Closed(),                            fromBlock, toBlock),
          queryChunked(cross,    cross.filters.Deposited(account),                fromBlock, toBlock),
          queryChunked(cross,    cross.filters.Withdrawn(account),                fromBlock, toBlock),
          queryChunked(cross,    cross.filters.PositionOpened(account),           fromBlock, toBlock),
          queryChunked(cross,    cross.filters.PositionClosed(account),           fromBlock, toBlock),
          queryChunked(orderMgr, orderMgr.filters.OrderCreated(null, account),   fromBlock, toBlock),
          queryChunked(orderMgr, orderMgr.filters.OrderCancelled(null, account), fromBlock, toBlock),
        ])

        if (!mountedRef.current) return

        /* Merge batch results into accumulator */
        acc.opened.push(...opened)
        acc.closedAll.push(...closedAll)
        acc.deposited.push(...deposited)
        acc.withdrawn.push(...withdrawn)
        acc.xOpened.push(...xOpened)
        acc.xClosed.push(...xClosed)
        acc.ordersCreated.push(...ordersCreated)
        acc.ordersCancelled.push(...ordersCancelled)

        /* Publish incremental results so UI updates as data arrives */
        const currentEntries = buildEntries(acc, currentBlock)
        setEntries(currentEntries)
        setSummary(buildSummary(acc))

        batchesDone++
        toBlock = fromBlock - 1

        /* Early-stop: enough data found after at least 2 passes */
        if (batchesDone >= 2 && currentEntries.length >= ENOUGH_RESULTS) break
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
