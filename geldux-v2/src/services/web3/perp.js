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

export async function openPosition({ sym, isLong, leverage, collateralUsd, markPrice }) {
  const signer  = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const market  = MARKETS.find((m) => m.sym === sym)
  if (!market)  throw new Error(`Unknown market: ${sym}`)

  const collateralRaw = parseUnits(String(Number(collateralUsd).toFixed(USDC_DECIMALS)), USDC_DECIMALS)
  const sizeUsdRaw    = parseUnits(String((Number(collateralUsd) * Number(leverage)).toFixed(USDC_DECIMALS)), USDC_DECIMALS)
  const accPrice      = _accPrice(markPrice, isLong, true)

  const [permit, { updateData, fee }] = await Promise.all([
    signPermit(signer, ADDRESSES.CORE, collateralRaw),
    getPythUpdateArgs(signer),
  ])

  const core = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
  const tx   = await core.openIsolatedWithPermitAndPriceUpdate(
    market.key, isLong, collateralRaw, sizeUsdRaw, accPrice,
    permit.deadline, permit.v, permit.r, permit.s,
    updateData, { value: fee }
  )
  const receipt = await waitTx(tx)
  const event   = receipt.logs
    ?.map((log) => { try { return core.interface.parseLog(log) } catch { return null } })
    ?.find((e) => e?.name === 'IsolatedPositionOpened')
  return { hash: tx.hash, receipt, posId: event?.args?.posId }
}

export async function closePosition({ sym, isLong, markPrice }) {
  const signer = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const market = MARKETS.find((m) => m.sym === sym)
  if (!market)  throw new Error(`Unknown market: ${sym}`)

  const accPrice             = _accPrice(markPrice, isLong, false)
  const { updateData, fee }  = await getPythUpdateArgs(signer)
  const core    = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, signer)
  const tx      = await core.closeIsolatedWithPriceUpdate(market.key, isLong, accPrice, updateData, { value: fee })
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

export async function fetchPositions(address) {
  const rp = getReadProvider()
  if (!rp) throw new Error('No RPC provider')
  const core = new Contract(ADDRESSES.CORE, ABI_PERP_CORE, rp)

  const probeIds = MARKETS.flatMap((m) => [
    core.getPositionId(address, m.key, true,  false),
    core.getPositionId(address, m.key, false, false),
  ])
  const probeResults = await Promise.allSettled(probeIds)
  const validIds     = probeResults
    .map((r) => (r.status === 'fulfilled' ? r.value : 0n))
    .filter((id) => id > 0n)

  if (!validIds.length) return []

  const [detailResults, liqResults] = await Promise.all([
    Promise.allSettled(validIds.map((id) => core.getPosition(id))),
    Promise.allSettled(validIds.map((id) => core.getLiquidationPrice(id))),
  ])

  return detailResults
    .map((r, i) => ({ posId: validIds[i], r, liq: liqResults[i] }))
    .filter(({ r }) => r.status === 'fulfilled' && r.value?.isOpen)
    .map(({ posId, r: { value: p }, liq }) => ({
      id:          Number(posId),
      trader:      p.trader,
      market:      p.market,
      isLong:      p.isLong,
      sizeUsd:     Number(p.sizeUsd)    / D_USDC,
      collateral:  Number(p.collateral) / D_USDC,
      entryPrice:  Number(p.entryPrice) / D_PRICE,
      openedAt:    Number(p.openedAt),
      liqPrice:    liq.status === 'fulfilled' ? Number(liq.value) / D_PRICE : null,
    }))
}
