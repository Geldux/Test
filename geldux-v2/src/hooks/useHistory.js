/**
 * useHistory — load on-chain event history for the connected wallet.
 *
 * Sources:
 *   PerpCore.Opened / Closed        — isolated perp trades
 *   CrossMargin.Deposited/Withdrawn / PositionOpened / PositionClosed — cross flows
 *   OrderManager.OrderCreated / OrderCancelled — order actions
 *
 * Closed events have no owner arg — they are matched client-side against the
 * posIds found in Opened events.  Cross close payout ≠ PnL (collateral is
 * unknown from the event alone); it is stored as `amount`, not `pnl`.
 *
 * Timestamps are estimated from block number at ~2 s/block (Base Sepolia).
 * Accuracy is ±minutes for recent events; good enough for relative display.
 *
 * Block range: last 500 000 blocks (~11 days).  Events older than this will
 * not appear.  This limit is a practical constraint of public-RPC log ranges.
 */
import { useState, useEffect, useCallback } from 'react'
import { Contract } from 'ethers'
import {
  ADDRESSES, ABI_PERP_CORE, ABI_CROSS_MARGIN, ABI_ORDER_MANAGER,
} from '@/config/contracts'
import { MARKETS } from '@/config/markets'
import { getReadProvider } from './useWallet'

export const BASESCAN_TX = 'https://sepolia.basescan.org/tx/'

const BLOCK_RANGE = 500_000

const ORDER_TYPE_LABEL = { 0: 'Limit', 1: 'Stop-Loss', 2: 'Take-Profit' }

function symFromKey(key) {
  return MARKETS.find((m) => m.key === key)?.sym ?? '?'
}

function estimateTs(blockNumber, currentBlock) {
  return Math.floor(Date.now() / 1000) - (currentBlock - blockNumber) * 2
}

export function useHistory(account) {
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!account) { setEntries([]); setSummary(null); return }
    const rp = getReadProvider()
    if (!rp) { console.warn('[useHistory] no read provider'); return }

    setLoading(true)
    try {
      const currentBlock = await rp.getBlockNumber()
      const fromBlock    = Math.max(0, currentBlock - BLOCK_RANGE)

      const core     = new Contract(ADDRESSES.PERP_CORE,     ABI_PERP_CORE,     rp)
      const cross    = new Contract(ADDRESSES.CROSS_MARGIN,  ABI_CROSS_MARGIN,  rp)
      const orderMgr = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, rp)

      const [
        openedRes, closedAllRes,
        depositedRes, withdrawnRes,
        xOpenedRes, xClosedRes,
        orderCreatedRes, orderCancelledRes,
      ] = await Promise.allSettled([
        core.queryFilter(core.filters.Opened(null, account),               fromBlock, currentBlock),
        core.queryFilter(core.filters.Closed(),                             fromBlock, currentBlock),
        cross.queryFilter(cross.filters.Deposited(account),                fromBlock, currentBlock),
        cross.queryFilter(cross.filters.Withdrawn(account),                fromBlock, currentBlock),
        cross.queryFilter(cross.filters.PositionOpened(account),           fromBlock, currentBlock),
        cross.queryFilter(cross.filters.PositionClosed(account),           fromBlock, currentBlock),
        orderMgr.queryFilter(orderMgr.filters.OrderCreated(null, account), fromBlock, currentBlock),
        orderMgr.queryFilter(orderMgr.filters.OrderCancelled(null, account), fromBlock, currentBlock),
      ])

      const warnFailed = (name, res) => {
        if (res.status === 'rejected')
          console.warn(`[useHistory] ${name} query failed:`, res.reason?.message ?? res.reason)
      }
      warnFailed('Opened',         openedRes)
      warnFailed('Closed',         closedAllRes)
      warnFailed('Deposited',      depositedRes)
      warnFailed('Withdrawn',      withdrawnRes)
      warnFailed('CrossOpened',    xOpenedRes)
      warnFailed('CrossClosed',    xClosedRes)
      warnFailed('OrderCreated',   orderCreatedRes)
      warnFailed('OrderCancelled', orderCancelledRes)

      const opened          = openedRes.status          === 'fulfilled' ? openedRes.value          : []
      const closedAll       = closedAllRes.status       === 'fulfilled' ? closedAllRes.value       : []
      const deposited       = depositedRes.status       === 'fulfilled' ? depositedRes.value       : []
      const withdrawn       = withdrawnRes.status       === 'fulfilled' ? withdrawnRes.value       : []
      const xOpened         = xOpenedRes.status         === 'fulfilled' ? xOpenedRes.value         : []
      const xClosed         = xClosedRes.status         === 'fulfilled' ? xClosedRes.value         : []
      const ordersCreated   = orderCreatedRes.status    === 'fulfilled' ? orderCreatedRes.value    : []
      const ordersCancelled = orderCancelledRes.status  === 'fulfilled' ? orderCancelledRes.value  : []

      /* Match PerpCore Closed events to this user's posIds */
      const userPosIds = new Set(opened.map((e) => e.args.posId.toString()))
      const closedMine = closedAll.filter((e) => userPosIds.has(e.args.posId.toString()))

      /* ── Summary metrics ──────────────────────────────────────── */
      const realizedPnl      = closedMine.reduce((s, e) => s + Number(e.args.pnl) / 1e18, 0)
      const totalDeposits    = deposited.reduce((s, e)  => s + Number(e.args.amt) / 1e18, 0)
      const totalWithdrawals = withdrawn.reduce((s, e)  => s + Number(e.args.amt) / 1e18, 0)
      const totalVolume      = opened.reduce((s, e) => {
        return s + (Number(e.args.collateral) / 1e18) * Number(e.args.leverage)
      }, 0)

      /* ── Build unified entry list ─────────────────────────────── */
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

      /* Isolated closes (matched to user's posIds) */
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

      setEntries(all)
      setSummary({
        tradeCount:       opened.length + xOpened.length,
        closedCount:      closedMine.length + xClosed.length,
        realizedPnl,
        totalDeposits,
        totalWithdrawals,
        totalVolume,
      })
    } catch (e) {
      console.warn('[useHistory] load failed:', e?.message ?? e)
    } finally {
      setLoading(false)
    }
  }, [account])

  useEffect(() => { load() }, [load])

  return { entries, summary, loading, reload: load }
}
