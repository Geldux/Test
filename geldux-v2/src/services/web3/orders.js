/**
 * Order management service — OrderManager interactions.
 *
 * createLimitOrder()   place a new limit open order (requires USDC approval)
 * createStopLoss()     attach a stop-loss to an existing position
 * createTakeProfit()   attach a take-profit to an existing position
 * cancelOrder()        cancel an active order and reclaim execution fee
 * fetchOrders()        read all active orders for an address
 */
import { Contract, parseUnits } from 'ethers'
import { ADDRESSES, ABI_ORDER_MANAGER, ABI_USDC } from '@/config/contracts'
import { MARKETS } from '@/config/markets'
import { getSigner, getReadProvider } from './wallet'

async function waitTx(tx) {
  const receipt = await tx.wait(1)
  if (receipt?.status === 0) throw new Error('Transaction reverted on-chain.')
  return receipt
}

async function ensureUsdcApproval(signer, spender, amount) {
  const usdc = new Contract(ADDRESSES.USDC, ABI_USDC, signer)
  const addr = await signer.getAddress()
  const have = await usdc.allowance(addr, spender)
  if (have < amount) {
    const tx = await usdc.approve(
      spender,
      BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
    )
    await waitTx(tx)
  }
}

/**
 * Place a limit open order.
 * Requires USDC approval for the collateral amount (auto-approved if needed).
 * An ETH execution fee (minExecFee) is paid to the keeper.
 *
 * @param {{ sym: string, isLong: boolean, leverage: number,
 *            collateralUsd: number, triggerPrice: number }} params
 */
export async function createLimitOrder({ sym, isLong, leverage, collateralUsd, triggerPrice }) {
  const signer = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const market = MARKETS.find((m) => m.sym === sym)
  if (!market)  throw new Error(`Unknown market: ${sym}`)
  const cRaw   = parseUnits(String(Number(collateralUsd).toFixed(18)), 18)
  const tRaw   = parseUnits(String(Number(triggerPrice).toFixed(18)), 18)
  const mgr    = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, signer)

  await ensureUsdcApproval(signer, ADDRESSES.ORDER_MANAGER, cRaw)

  const minFee  = await mgr.minExecFee()
  const tx      = await mgr.createLimitOrder(
    market.key, isLong, leverage, cRaw, false, tRaw, { value: minFee }
  )
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

/**
 * Attach a stop-loss to an open position.
 *
 * @param {{ posId: number|bigint, triggerPrice: number, fractionBps?: number }} params
 *   fractionBps: how much of the position to close when triggered (10000 = 100%)
 */
export async function createStopLoss({ posId, triggerPrice, fractionBps = 10000 }) {
  const signer  = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const tRaw    = parseUnits(String(Number(triggerPrice).toFixed(18)), 18)
  const mgr     = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, signer)
  const minFee  = await mgr.minExecFee()
  const tx      = await mgr.createStopLoss(posId, tRaw, fractionBps, { value: minFee })
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

/**
 * Attach a take-profit to an open position.
 *
 * @param {{ posId: number|bigint, triggerPrice: number, fractionBps?: number }} params
 */
export async function createTakeProfit({ posId, triggerPrice, fractionBps = 10000 }) {
  const signer  = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const tRaw    = parseUnits(String(Number(triggerPrice).toFixed(18)), 18)
  const mgr     = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, signer)
  const minFee  = await mgr.minExecFee()
  const tx      = await mgr.createTakeProfit(posId, tRaw, fractionBps, { value: minFee })
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

/**
 * Cancel an active order. Reclaims the execution fee.
 *
 * @param {{ orderId: number|bigint }} params
 */
export async function cancelOrder({ orderId }) {
  const signer  = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const mgr     = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, signer)
  const tx      = await mgr.cancelOrder(orderId)
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

/**
 * Fetch all active orders for an address.
 *
 * @param {string} address
 * @returns {Array<{ id, assetKey, orderType, isLong, leverage, collateral,
 *   triggerPrice, fractionBps, posId, active, executionFee }>}
 */
export async function fetchOrders(address) {
  const rp  = getReadProvider()
  if (!rp) throw new Error('No RPC provider')
  const mgr = new Contract(ADDRESSES.ORDER_MANAGER, ABI_ORDER_MANAGER, rp)

  const ids = await mgr.traderOrders(address)
  if (!ids.length) return []

  const rawOrders = await Promise.allSettled(ids.map((id) => mgr.getOrder(id)))
  return rawOrders
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter((o) => o && o.active)
    .map((o) => ({
      id:           Number(o.id),
      assetKey:     o.assetKey,
      orderType:    Number(o.orderType),  /* 0=limit, 1=stopLoss, 2=takeProfit */
      isLong:       o.isLong,
      leverage:     Number(o.leverage),
      collateral:   Number(o.collateral)   / 1e18,
      triggerPrice: Number(o.triggerPrice) / 1e18,
      fractionBps:  Number(o.fractionBps),
      posId:        Number(o.posId),
      triggerAbove: o.triggerAbove,
      active:       o.active,
      executionFee: Number(o.executionFee),
    }))
}
