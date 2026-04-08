/**
 * Cross-margin service — CrossMarginManager interactions.
 *
 * depositWithPermit()  1-click USDC deposit via EIP-2612 permit
 * withdraw()           withdraw USDC from cross margin balance
 * openPosition()       open a cross-margin position
 * increasePosition()   add collateral to an existing cross position
 * closePosition()      close (fully or partial) a cross position
 * fetchAccount()       read cross margin balance, equity, and positions
 */
import { Contract, parseUnits } from 'ethers'
import { ADDRESSES, ABI_CROSS_MARGIN } from '@/config/contracts'
import { MARKETS } from '@/config/markets'
import { getSigner, getReadProvider } from './wallet'
import { signPermit } from './usdcPermit'

async function waitTx(tx) {
  const receipt = await tx.wait(1)
  if (receipt?.status === 0) throw new Error('Transaction reverted on-chain.')
  return receipt
}

/**
 * Deposit USDC to cross margin with a single permit signature.
 *
 * @param {{ amountUsd: number }} params
 */
export async function depositWithPermit({ amountUsd }) {
  const signer  = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const amtRaw  = parseUnits(String(Number(amountUsd).toFixed(18)), 18)
  const permit  = await signPermit(signer, ADDRESSES.CROSS_MARGIN, amtRaw)
  const cross   = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, signer)
  const tx      = await cross.depositWithPermit(amtRaw, permit.deadline, permit.v, permit.r, permit.s)
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

/**
 * Withdraw USDC from cross margin balance.
 *
 * @param {{ amountUsd: number }} params
 */
export async function withdraw({ amountUsd }) {
  const signer  = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const amtRaw  = parseUnits(String(Number(amountUsd).toFixed(18)), 18)
  const cross   = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, signer)
  const tx      = await cross.withdraw(amtRaw)
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

/**
 * Open a cross-margin position.
 * Collateral is drawn from the cross margin account balance.
 *
 * @param {{ sym: string, isLong: boolean, leverage: number, collateralUsd: number }} params
 */
export async function openPosition({ sym, isLong, leverage, collateralUsd }) {
  const signer = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const market = MARKETS.find((m) => m.sym === sym)
  if (!market) throw new Error(`Unknown market: ${sym}`)
  const cRaw   = parseUnits(String(Number(collateralUsd).toFixed(18)), 18)
  const cross  = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, signer)
  const tx     = await cross.openPosition(market.key, isLong, leverage, cRaw, false)
  const receipt = await waitTx(tx)
  const event   = receipt.logs
    ?.map((log) => { try { return cross.interface.parseLog(log) } catch { return null } })
    ?.find((e) => e?.name === 'PositionOpened')
  return { hash: tx.hash, receipt, posId: event?.args?.posId }
}

/**
 * Add collateral to an existing cross-margin position.
 *
 * @param {{ posId: number|bigint, extraUsd: number }} params
 */
export async function increasePosition({ posId, extraUsd }) {
  const signer  = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const extra   = parseUnits(String(Number(extraUsd).toFixed(18)), 18)
  const cross   = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, signer)
  const tx      = await cross.increasePosition(posId, extra)
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

/**
 * Close a cross-margin position fully or partially.
 *
 * @param {{ posId: number|bigint, fractionBps?: number }} params
 *   fractionBps: 10000 = 100% (full close), 5000 = 50%, etc.
 */
export async function closePosition({ posId, fractionBps = 10000 }) {
  const signer  = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const cross   = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, signer)
  const tx      = await cross.closePosition(posId, fractionBps)
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

/**
 * Read the cross margin account state for an address.
 *
 * @param {string} address
 * @returns {{ balance: number, posIds: number[], equity: number, marginUsed: number, freeMargin: number }}
 */
export async function fetchAccount(address) {
  const rp = getReadProvider()
  if (!rp) throw new Error('No RPC provider')
  const cross = new Contract(ADDRESSES.CROSS_MARGIN, ABI_CROSS_MARGIN, rp)

  const [[balance, posIds], equity, mm] = await Promise.all([
    cross.getAccount(address),
    cross.accountEquity(address).catch(() => 0n),
    cross.accountMM(address).catch(() => 0n),
  ])

  return {
    balance:    Number(balance) / 1e18,
    posIds:     posIds.map((id) => Number(id)),
    equity:     Number(equity) / 1e18,
    marginUsed: Number(mm) / 1e18,
    freeMargin: Math.max(0, Number(equity) / 1e18 - Number(mm) / 1e18),
  }
}
