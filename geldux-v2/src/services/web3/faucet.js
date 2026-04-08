/**
 * Faucet service — Geldux testnet USDC faucet.
 *
 * claimFaucet()   claim testnet USDC (respects cooldown)
 * faucetInfo()    read claim amount, cooldown period, and faucet balance
 * canClaim()      check if an address can currently claim
 */
import { Contract } from 'ethers'
import { ADDRESSES, ABI_FAUCET } from '@/config/contracts'
import { getSigner, getReadProvider } from './wallet'

async function waitTx(tx) {
  const receipt = await tx.wait(1)
  if (receipt?.status === 0) throw new Error('Transaction reverted on-chain.')
  return receipt
}

/**
 * Attempt to claim testnet USDC from the faucet.
 * Throws a human-readable error if still on cooldown.
 */
export async function claimFaucet() {
  const signer = getSigner()
  if (!signer) throw new Error('Wallet not connected')
  const addr = await signer.getAddress()
  const fau  = new Contract(ADDRESSES.FAUCET, ABI_FAUCET, signer)

  const can = await fau.canClaim(addr)
  if (!can) {
    const rem = await fau.cooldownRemaining(addr)
    const h   = Math.floor(Number(rem) / 3600)
    const m   = Math.ceil((Number(rem) % 3600) / 60)
    throw new Error(`Faucet cooldown: ${h}h ${m}m remaining.`)
  }

  const tx      = await fau.claim({ gasLimit: 120_000 })
  const receipt = await waitTx(tx)
  return { hash: tx.hash, receipt }
}

/**
 * Read public faucet parameters.
 *
 * @returns {{ claimAmount: number, cooldownSecs: number, balance: number }}
 */
export async function faucetInfo() {
  const rp  = getReadProvider()
  if (!rp) throw new Error('No RPC provider')
  const fau = new Contract(ADDRESSES.FAUCET, ABI_FAUCET, rp)

  const [claimAmt, cooldown, balance] = await Promise.all([
    fau.claimAmount(),
    fau.cooldownPeriod(),
    fau.faucetBalance(),
  ])

  return {
    claimAmount:  Number(claimAmt)  / 1e18,
    cooldownSecs: Number(cooldown),
    balance:      Number(balance)   / 1e18,
  }
}

/**
 * Check whether an address can claim right now.
 *
 * @param {string} address
 * @returns {{ canClaim: boolean, cooldownRemaining: number }}
 */
export async function canClaim(address) {
  const rp  = getReadProvider()
  if (!rp) throw new Error('No RPC provider')
  const fau = new Contract(ADDRESSES.FAUCET, ABI_FAUCET, rp)

  const [ok, rem] = await Promise.all([
    fau.canClaim(address),
    fau.cooldownRemaining(address),
  ])

  return { canClaim: ok, cooldownRemaining: Number(rem) }
}
