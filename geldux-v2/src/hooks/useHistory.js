/**
 * useHistory — on-chain event history for the connected wallet.
 *
 * Perp / futures coverage:
 *   PerpCore.Opened           — isolated open
 *   PerpCore.Closed           — isolated close (matched to user via posId)
 *   CrossMargin.Deposited     — cross margin deposit
 *   CrossMargin.Withdrawn     — cross margin withdrawal
 *   CrossMargin.PositionOpened  — cross open
 *   CrossMargin.PositionClosed  — cross close (payout stored as amount)
 *   CrossMargin.PositionIncreased — cross collateral add
 *   OrderManager.OrderCreated   — limit / SL / TP placed
 *   OrderManager.OrderCancelled — order cancelled
 *
 * NOT trackable from events (contract limitation):
 *   PerpCore isolated increases — increaseWithPermitAndPriceUpdate emits no event.
 *   OrderExecuted               — indexes the keeper, not the trader.
 *
 * RPC notes:
 *   Public Base Sepolia nodes (sepolia.base.org, publicnode.com) allow ~10-20
 *   concurrent eth_getLogs calls before rate-limiting.  CONCURRENCY = 1 keeps
 *   within-type queries sequential; 9 event types run in parallel in Promise.all,
 *   giving at most 9 simultaneous requests — safe for all RPCs.
 *
 *   CHUNK_SIZE = 1 000 keeps individual block ranges within the limits of
 *   public nodes (most accept up to 2 000 but 1 000 is safe everywhere).
 *
 * Loading:
 *   Progressive: results published after each BATCH_BLOCKS window so the UI
 *   shows data as it arrives.  Hard cap varies: ~11.6 days with Alchemy history
 *   RPC (VITE_ALCHEMY_HISTORY_RPC), ~2.3 days on public RPCs.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Contract } from 'ethers'
import {
  ADDRESSES, ABI_PERP_CORE, ABI_CROSS_MARGIN, ABI_ORDER_MANAGER,
} from '@/config/contracts'
import { MARKETS } from '@/config/markets'
import { getHistoryProvider } from './useWallet'
import { HAS_ALCHEMY_HISTORY } from '@/config/chain'

export const BASESCAN_TX = 'https://sepolia.basescan.org/tx/'

const CHUNK_SIZE   = 1_000    /* blocks per eth_getLogs call — safe on all RPCs */
const CONCURRENCY  = 1        /* sequential chunks per event type — prevents rate-limiting */
/* Larger batches and deeper lookback when a dedicated Alchemy history RPC is present. */
const BATCH_BLOCKS = HAS_ALCHEMY_HISTORY ? 50_000  : 20_000
const MAX_LOOKBACK = HAS_ALCHEMY_HISTORY ? 500_000 : 100_000

/**
 * Fetch all events in [fromBlock, toBlock] using sequential CHUNK_SIZE slices.
 * CONCURRENCY=1 means one request at a time per event type, preventing
 * rate-limit failures on public RPCs.  Chunk failures are logged and skipped.
 */
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

/** Build the unified sorted entry list from all accumulated event sets. */
function buildEntries(acc, currentBlock) {
  const {
    opened, closedAll, deposited, withdrawn,
    xOpened, xClosed, xIncreased,
    ordersCreated, ordersCancelled,
  } = acc

  /* Closed events have no owner — match against this user's known posIds */
  const userPosIds = new Set(opened.map((e) => e.args.posId.toString()))
  const closedMine = closedAll.filter((e) => userPosIds.has(e.args.posId.toString()))

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
      sym:        matched ? symFromKey(matched.args.key) : '?',
      isLong:     matched ? matched.args.isLong : null,
      posId:      posId.toString(),
      leverage:   matched ? Number(matched.args.leverage) : null,
      collateral: matched ? Number(matched.args.collateral) / 1e18 : null,
      size:       matched
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

  /* Cross closes — payout stored as amount */
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

  /* Cross collateral adds */
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

  /* Cross deposits */
  deposited.forEach((e) => {
    all.push({
      type: 'deposit', hash: e.transactionHash,
      blockNumber: e.blockNumber, ts: estimateTs(e.blockNumber, currentBlock),
      sym: '', isLong: null, posId: null,
      leverage: null, collateral: null, size: null,
      pnl: null, amount: Number(e.args.amt) / 1e18, label: null,
    })
  })

  /* Cross withdrawals */
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

  all.sort((a, b) => b.blockNumber - a.blockNumber)
  return all
}

function buildSummary(acc) {
  const { opened, xOpened, closedAll, deposited, withdrawn, xClosed } = acc
  const userPosIds = new Set(opened.map((e) => e.args.posId.toString()))
  const closedMine = closedAll.filter((e) => userPosIds.has(e.args.posId.toString()))

  return {
    tradeCount:       opened.length + xOpened.length,
    closedCount:      closedMine.length + xClosed.length,
    realizedPnl:      closedMine.reduce((s, e) => s + Number(e.args.pnl) / 1e18, 0),
    totalDeposits:    deposited.reduce((s, e) => s + Number(e.args.amt) / 1e18, 0),
    totalWithdrawals: withdrawn.reduce((s, e) => s + Number(e.args.amt) / 1e18, 0),
    totalVolume:      opened.reduce((s, e) =>
      s + (Number(e.args.collateral) / 1e18) * Number(e.args.leverage), 0),
  }
}

export function useHistory(account) {
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const mountedRef            = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async () => {
    if (!account) { setEntries([]); setSummary(null); setError(null); return }
    const rp = getHistoryProvider()
    if (!rp) {
      console.error('[useHistory] no history provider — check RPC config')
      setError('No RPC provider available. Check network configuration.')
      return
    }

    setEntries([])
    setSummary(null)
    setError(null)
    setLoading(true)

    try {
      const currentBlock = await rp.getBlockNumber()
      const limitBlock   = Math.max(0, currentBlock - MAX_LOOKBACK)

      if (import.meta.env.DEV) console.log(`[useHistory] scanning blocks ${limitBlock}–${currentBlock} for ${account.slice(0, 8)}… (history RPC: ${HAS_ALCHEMY_HISTORY})`)

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

      while (toBlock > limitBlock) {
        if (!mountedRef.current) return

        const fromBlock = Math.max(limitBlock, toBlock - BATCH_BLOCKS + 1)
        batchIndex++

        if (import.meta.env.DEV) console.log(`[useHistory] batch ${batchIndex}: blocks ${fromBlock}–${toBlock}`)

        /* 9 event types in parallel; each type queries its chunks sequentially.
         * Peak concurrency = 9 simultaneous eth_getLogs calls — safe on all RPCs. */
        const [
          opened, closedAll,
          deposited, withdrawn,
          xOpened, xClosed, xIncreased,
          ordersCreated, ordersCancelled,
        ] = await Promise.all([
          queryChunked(core,     core.filters.Opened(null, account),              fromBlock, toBlock, 'Opened'),
          queryChunked(core,     core.filters.Closed(),                            fromBlock, toBlock, 'Closed'),
          queryChunked(cross,    cross.filters.Deposited(account),                fromBlock, toBlock, 'Deposited'),
          queryChunked(cross,    cross.filters.Withdrawn(account),                fromBlock, toBlock, 'Withdrawn'),
          queryChunked(cross,    cross.filters.PositionOpened(account),           fromBlock, toBlock, 'PositionOpened'),
          queryChunked(cross,    cross.filters.PositionClosed(account),           fromBlock, toBlock, 'PositionClosed'),
          queryChunked(cross,    cross.filters.PositionIncreased(account),        fromBlock, toBlock, 'PositionIncreased'),
          queryChunked(orderMgr, orderMgr.filters.OrderCreated(null, account),   fromBlock, toBlock, 'OrderCreated'),
          queryChunked(orderMgr, orderMgr.filters.OrderCancelled(null, account), fromBlock, toBlock, 'OrderCancelled'),
        ])

        if (!mountedRef.current) return

        if (batchIndex === 1) {
          if (import.meta.env.DEV) console.log('[useHistory] first batch results:', {
            opened: opened.length, closedAll: closedAll.length,
            deposited: deposited.length, xOpened: xOpened.length,
            ordersCreated: ordersCreated.length,
          })
          const total = opened.length + deposited.length + xOpened.length + ordersCreated.length
          if (total === 0) {
            console.warn(
              '[useHistory] zero events in first batch — possible rate-limit on public RPC.\n' +
              '  Set VITE_ALCHEMY_HISTORY_RPC in .env.local for dedicated event queries.'
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

        setEntries(buildEntries(acc, currentBlock))
        setSummary(buildSummary(acc))

        toBlock = fromBlock - 1
      }
    } catch (e) {
      console.error('[useHistory] load failed:', e?.message ?? e)
      if (mountedRef.current) setError(e?.message ?? 'History load failed — check console for details')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [account])

  useEffect(() => { load() }, [load])

  return { entries, summary, loading, error, reload: load }
}
