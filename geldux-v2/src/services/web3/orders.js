/**
 * Order service — GelduxOrderRouter interactions (Perp V2).
 *
 * V2 orders are submitted off-chain (EIP-712 signed) and executed by keepers.
 * The only on-chain action available to traders is cancelOrder(nonce).
 *
 * cancelOrder()    cancel a pending order by nonce (reclaims execution ETH)
 * fetchOrders()    stub — V2 order state lives off-chain; returns empty array
 */
import { Contract } from 'ethers'
import { ADDRESSES, ABI_ROUTER } from '@/config/contracts'
import { getSigner, getReadProvider } from './wallet'

async function waitTx(tx) {
  const receipt = await tx.wait(1)
  if (receipt?.status === 0) throw new Error('Transaction reverted on-chain.')
  return receipt
}

export async function cancelOrder({ nonce }) {
  const signer  = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const router  = new Contract(ADDRESSES.ROUTER, ABI_ROUTER, signer)
  const tx      = await router.cancelOrder(nonce)
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

export async function fetchOrders() {
  return []
}
