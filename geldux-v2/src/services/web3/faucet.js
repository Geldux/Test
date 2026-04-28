import { Contract } from 'ethers'
import { ADDRESSES, ABI_USDC } from '@/config/contracts'
import { USDC_DECIMALS } from '@/config/chain'
import { getSigner, getReadProvider } from './wallet'

const D_USDC = 10 ** USDC_DECIMALS

async function waitTx(tx) {
  const receipt = await tx.wait(1)
  if (receipt?.status === 0) throw new Error('Transaction reverted on-chain.')
  return receipt
}

export async function claimFaucet() {
  const signer = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const usdc    = new Contract(ADDRESSES.USDC, ABI_USDC, signer)
  const tx      = await usdc.faucet({ gasLimit: 120_000 })
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

export async function faucetInfo() {
  const rp = getReadProvider()
  if (!rp) throw new Error('No RPC provider')
  const usdc   = new Contract(ADDRESSES.USDC, ABI_USDC, rp)
  const amtRaw = await usdc.FAUCET_AMOUNT()
  return {
    claimAmount:  Number(amtRaw) / D_USDC,
    cooldownSecs: 0,
    balance:      null,
  }
}

export async function canClaim() {
  return { canClaim: true, cooldownRemaining: 0 }
}
