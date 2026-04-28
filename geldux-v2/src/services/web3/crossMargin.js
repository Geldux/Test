import { Contract, parseUnits } from 'ethers'
import { ADDRESSES, ABI_PERP_CORE } from '@/config/contracts'
import { MARKETS } from '@/config/markets'
import { USDC_DECIMALS, PRICE_DECIMALS } from '@/config/chain'
import { getSigner, getReadProvider } from './wallet'
import { signPermit } from './usdcPermit'
import { getPythUpdateArgs } from './oracle'

const D_USDC  = 10 ** USDC_DECIMALS
const D_PRICE = 10 ** PRICE_DECIMALS
const SLIPPAGE = 0.01

function _accPrice(markPrice, isLong, isOpen) {
  if (!markPrice) return 0n
  const wantMax = (isLong && isOpen) || (!isLong && !isOpen)
  const price   = wantMax ? markPrice * (1 + SLIPPAGE) : markPrice * (1 - SLIPPAGE)
  return parseUnits(price.toFixed(18), 18)
}

async function waitTx(tx) {
  const receipt = await tx.wait(1)
  if (receipt?.status === 0) throw new Error('Transaction reverted on-chain.')
  return receipt
}

export async function depositWithPermit({ amountUsd }) {
  const signer  = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const amtRaw  = parseUnits(String(Number(amountUsd).toFixed(USDC_DECIMALS)), USDC_DECIMALS)
  /* V2: permit spender = CORE */
  const permit  = await signPermit(signer, ADDRESSES.CORE, amtRaw)
  const core    = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
  const tx      = await core.depositCrossWithPermit(amtRaw, permit.deadline, permit.v, permit.r, permit.s)
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

export async function withdraw({ amountUsd, markPrices = {} }) {
  const signer  = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const amtRaw  = parseUnits(String(Number(amountUsd).toFixed(USDC_DECIMALS)), USDC_DECIMALS)
  const { updateData, fee } = await getPythUpdateArgs(signer)
  const core    = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
  const tx      = await core.withdrawCross(amtRaw, updateData, { value: fee })
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

export async function openPosition({ sym, isLong, leverage, collateralUsd, markPrice }) {
  const signer = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const market = MARKETS.find((m) => m.sym === sym)
  if (!market) throw new Error(`Unknown market: ${sym}`)
  const sizeUsdRaw  = parseUnits(
    String((Number(collateralUsd) * Number(leverage)).toFixed(USDC_DECIMALS)),
    USDC_DECIMALS
  )
  const accPrice            = _accPrice(markPrice, isLong, true)
  const { updateData, fee } = await getPythUpdateArgs(signer)
  const core                = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
  const tx      = await core.openCrossWithPriceUpdate(market.key, isLong, sizeUsdRaw, accPrice, updateData, { value: fee })
  const receipt = await waitTx(tx)
  const event   = receipt.logs
    ?.map((log) => { try { return core.interface.parseLog(log) } catch { return null } })
    ?.find((e) => e?.name === 'CrossPositionOpened')
  return { hash: tx.hash, receipt, posId: event?.args?.posId }
}

export async function increasePosition({ sym, isLong, addSizeUsd, markPrice }) {
  const signer  = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const market  = MARKETS.find((m) => m.sym === sym)
  if (!market)  throw new Error(`Unknown market: ${sym}`)
  const addSizeRaw          = parseUnits(String(Number(addSizeUsd).toFixed(USDC_DECIMALS)), USDC_DECIMALS)
  const accPrice            = _accPrice(markPrice, isLong, true)
  const { updateData, fee } = await getPythUpdateArgs(signer)
  const core    = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
  const tx      = await core.increaseCrossWithPriceUpdate(market.key, isLong, addSizeRaw, accPrice, updateData, { value: fee })
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

export async function closePosition({ sym, isLong, markPrice }) {
  const signer  = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const market  = MARKETS.find((m) => m.sym === sym)
  if (!market)  throw new Error(`Unknown market: ${sym}`)
  const accPrice            = _accPrice(markPrice, isLong, false)
  const { updateData, fee } = await getPythUpdateArgs(signer)
  const core    = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
  const tx      = await core.closeCrossWithPriceUpdate(market.key, isLong, accPrice, updateData, { value: fee })
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

export async function fetchAccount(address) {
  const rp = getReadProvider()
  if (!rp) throw new Error('No RPC provider')
  const core = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, rp)

  const [collateralRes, posIdsRes, equityRes, freeMarginRes] = await Promise.allSettled([
    core.crossCollateral(address),
    core.getCrossPositions(address),
    core.getCrossAccountEquity(address),
    core.getCrossFreeMargin(address),
  ])

  const balance    = collateralRes.status === 'fulfilled' ? Number(collateralRes.value) / D_USDC : 0
  const posIds     = posIdsRes.status     === 'fulfilled' ? posIdsRes.value.map((id) => Number(id)) : []
  const equity     = equityRes.status     === 'fulfilled' ? Number(equityRes.value)     / D_USDC : null
  const freeMargin = freeMarginRes.status === 'fulfilled' ? Number(freeMarginRes.value) / D_USDC : null

  return { balance, posIds, equity, freeMargin, marginUsed: equity != null && freeMargin != null ? equity - freeMargin : null }
}
