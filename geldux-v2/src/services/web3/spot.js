/**
 * Spot DEX service — SpotDex contract interactions.
 *
 * fetchSpotMarkets()  load all active markets (getAllMarkets + getMarket)
 * quoteSpot()         get (amountOut, fee, priceUSD) for a given input
 * buySpot()           approve USDC if needed, then buy
 * sellSpot()          approve token if needed, then sell
 *
 * Market IDs are bytes32. All amounts use 18-decimal precision.
 */
import { Contract, MaxUint256 } from 'ethers'
import { ADDRESSES, ABI_SPOT_DEX, ABI_USDC } from '@/config/contracts'
import { getSigner, getReadProvider } from '@/hooks/useWallet'

async function waitTx(tx) {
  const receipt = await tx.wait(1)
  if (receipt?.status === 0) throw new Error('Transaction reverted on-chain.')
  return receipt
}

async function ensureApproval(signer, tokenAddress, spender, amount) {
  const token = new Contract(tokenAddress, ABI_USDC, signer)
  const owner = await signer.getAddress()
  const have  = await token.allowance(owner, spender)
  if (have < amount) {
    console.log('[spot] approving', tokenAddress, 'for', spender)
    const tx = await token.approve(spender, MaxUint256)
    await waitTx(tx)
  }
}

/**
 * Load all active spot markets.
 * @returns {Array<{ id: string, token: string, symbol: string, tokenReserve: number, price: number }>}
 */
export async function fetchSpotMarkets() {
  const rp = getReadProvider()
  if (!rp) throw new Error('No read provider')
  const dex = new Contract(ADDRESSES.SPOT_DEX, ABI_SPOT_DEX, rp)
  const ids = await dex.getAllMarkets()
  if (!ids.length) return []
  const results = await Promise.allSettled(ids.map((id) => dex.getMarket(id)))
  return results
    .map((r, i) => ({ id: ids[i], r }))
    .filter(({ r }) => r.status === 'fulfilled' && r.value.active)
    .map(({ id, r: { value: m } }) => ({
      id:           id,                           /* bytes32 hex string */
      token:        m.token,
      priceKey:     m.priceKey,
      symbol:       m.symbol,
      tokenReserve: Number(m.tokenReserve) / 1e18,
      price:        Number(m.price)        / 1e18,
    }))
}

/**
 * Get a quote for a spot trade.
 * buying=true:  amountIn is USDC → returns token amountOut
 * buying=false: amountIn is token → returns USDC amountOut
 *
 * @returns {{ amountOut: bigint, fee: bigint, priceUSD: bigint }}
 */
export async function quoteSpot(id, buying, amountIn) {
  const rp = getReadProvider()
  if (!rp) throw new Error('No read provider')
  const dex = new Contract(ADDRESSES.SPOT_DEX, ABI_SPOT_DEX, rp)
  const [amountOut, fee, priceUSD] = await dex.quote(id, buying, amountIn)
  return { amountOut, fee, priceUSD }
}

/**
 * Buy tokens with USDC. Auto-approves USDC if allowance is insufficient.
 *
 * @param {{ id: string, usdcIn: bigint, minOut: bigint }} params
 * @returns {{ hash: string, receipt: object }}
 */
export async function buySpot({ id, usdcIn, minOut }) {
  const signer = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  await ensureApproval(signer, ADDRESSES.USDC, ADDRESSES.SPOT_DEX, usdcIn)
  const dex     = new Contract(ADDRESSES.SPOT_DEX, ABI_SPOT_DEX, signer)
  console.log('[spot] buy id:', id, 'usdcIn:', usdcIn.toString(), 'minOut:', minOut.toString())
  const tx      = await dex.buy(id, usdcIn, minOut)
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

/**
 * Sell tokens for USDC. Auto-approves the token if allowance is insufficient.
 * tokenIn is the amount of tokens to sell (uint256), not the token address.
 *
 * @param {{ id: string, tokenIn: bigint, tokenAddress: string, minUsdc: bigint }} params
 * @returns {{ hash: string, receipt: object }}
 */
export async function sellSpot({ id, tokenIn, tokenAddress, minUsdc }) {
  const signer = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  await ensureApproval(signer, tokenAddress, ADDRESSES.SPOT_DEX, tokenIn)
  const dex     = new Contract(ADDRESSES.SPOT_DEX, ABI_SPOT_DEX, signer)
  console.log('[spot] sell id:', id, 'tokenIn:', tokenIn.toString(), 'minUsdc:', minUsdc.toString())
  const tx      = await dex.sell(id, tokenIn, minUsdc)
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}
