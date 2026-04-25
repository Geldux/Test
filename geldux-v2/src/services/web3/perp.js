/**
 * Isolated perpetuals service — PerpCore interactions.
 *
 * openPosition()      1-click: permit + pyth update + open
 * increasePosition()  1-click: permit + pyth update + increase collateral
 * closePosition()     pyth update + close in one tx
 * fetchPositions()    read all open positions for an address
 */
import { Contract, parseUnits } from 'ethers'
import { ADDRESSES, ABI_PERP_CORE, ABI_PERP_STORE } from '@/config/contracts'
import { MARKETS } from '@/config/markets'
import { getSigner, getReadProvider } from './wallet'
import { signPermit } from './usdcPermit'
import { getPythUpdateArgs } from './oracle'

async function waitTx(tx) {
  const receipt = await tx.wait(1)
  if (receipt?.status === 0) throw new Error('Transaction reverted on-chain.')
  return receipt
}

/**
 * Open an isolated perp position with a single user signature.
 *
 * @param {{ sym: string, isLong: boolean, leverage: number, collateralUsd: number }} params
 * @returns {{ hash: string, posId?: bigint, receipt: object }}
 */
export async function openPosition({ sym, isLong, leverage, collateralUsd }) {
  const signer  = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const market  = MARKETS.find((m) => m.sym === sym)
  if (!market)  throw new Error(`Unknown market: ${sym}`)

  const collateralRaw = parseUnits(String(Number(collateralUsd).toFixed(18)), 18)

  const [permit, { updateData, fee }] = await Promise.all([
    signPermit(signer, ADDRESSES.PERP_VAULT, collateralRaw),
    getPythUpdateArgs(signer),
  ])

  const core = new Contract(ADDRESSES.PERP_CORE, ABI_PERP_CORE, signer)
  const tx   = await core.openWithPermitAndPriceUpdate(
    market.key,
    isLong,
    leverage,
    collateralRaw,
    false,               /* reduceOnly */
    permit.deadline,
    permit.v,
    permit.r,
    permit.s,
    updateData,
    { value: fee }
  )
  const receipt = await waitTx(tx)
  /* Parse posId from Opened event if present */
  const openedEvent = receipt.logs
    ?.map((log) => { try { return core.interface.parseLog(log) } catch { return null } })
    ?.find((e) => e?.name === 'Opened')
  return { hash: tx.hash, receipt, posId: openedEvent?.args?.posId }
}

/**
 * Add collateral to an existing isolated position.
 *
 * @param {{ posId: number|bigint, collateralUsd: number }} params
 */
export async function increasePosition({ posId, collateralUsd }) {
  const signer = getSigner()
  if (!signer) throw new Error('Wallet not connected')

  const extra = parseUnits(String(Number(collateralUsd).toFixed(18)), 18)

  const [permit, { updateData, fee }] = await Promise.all([
    signPermit(signer, ADDRESSES.PERP_VAULT, extra),
    getPythUpdateArgs(signer),
  ])

  const core    = new Contract(ADDRESSES.PERP_CORE, ABI_PERP_CORE, signer)
  const tx      = await core.increaseWithPermitAndPriceUpdate(
    posId, extra, permit.deadline, permit.v, permit.r, permit.s, updateData, { value: fee }
  )
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

/**
 * Close an isolated position fully.
 *
 * @param {{ posId: number|bigint }} params
 */
export async function closePosition({ posId }) {
  const signer = getSigner()
  if (!signer) throw new Error('Wallet not connected')

  const { updateData, fee } = await getPythUpdateArgs(signer)
  const core    = new Contract(ADDRESSES.PERP_CORE, ABI_PERP_CORE, signer)
  const tx      = await core.closeWithPriceUpdate(posId, updateData, { value: fee })
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

/**
 * Partially close an isolated position (reduce collateral).
 *
 * @param {{ posId: number|bigint, collateralDeltaUsd: number }} params
 */
export async function partialClose({ posId, collateralDeltaUsd }) {
  const signer      = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const delta       = parseUnits(String(Number(collateralDeltaUsd).toFixed(18)), 18)
  const { updateData, fee } = await getPythUpdateArgs(signer)
  const core        = new Contract(ADDRESSES.PERP_CORE, ABI_PERP_CORE, signer)
  const tx          = await core.partialCloseWithPriceUpdate(posId, delta, updateData, { value: fee })
  const receipt     = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

/**
 * Fetch all open isolated positions for a given address.
 *
 * @param {string} address
 * @returns {Array<{ id: number, owner: string, assetKey: string, isLong: boolean,
 *   leverage: number, collateral: number, size: number, entryPrice: number,
 *   openTime: number, fundingEntry: number }>}
 */
export async function fetchPositions(address) {
  const rp = getReadProvider()
  if (!rp) throw new Error('No RPC provider')
  const store  = new Contract(ADDRESSES.PERP_STORE, ABI_PERP_STORE, rp)
  const ids    = await store.getUserPositions(address)
  if (!ids.length) return []

  const details = await Promise.allSettled(ids.map((id) => store.getPosition(id)))
  return details
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
