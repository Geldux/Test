/**
 * EIP-2612 Permit signing for USDC.
 *
 * signPermit(signer, spender, amount) → { v, r, s, deadline }
 *
 * Enables 1-click flows: the signed permit is passed directly to
 * openWithPermitAndPriceUpdate / increaseWithPermitAndPriceUpdate /
 * depositWithPermit — no separate approval transaction needed.
 */
import { Contract, Signature } from 'ethers'
import { CHAIN_ID, PERMIT_DEADLINE_SECONDS } from '@/config/chain'
import { ADDRESSES, ABI_USDC } from '@/config/contracts'

/**
 * @param {import('ethers').Signer} signer
 * @param {string}  spender   contract that will consume the permit
 * @param {bigint}  amount    token amount in wei (18-decimal)
 * @returns {{ v: number, r: string, s: string, deadline: number }}
 */
export async function signPermit(signer, spender, amount) {
  const usdc    = new Contract(ADDRESSES.USDC, ABI_USDC, signer)
  const owner   = await signer.getAddress()
  const [name, nonce] = await Promise.all([
    usdc.name().catch(() => 'USD Coin'),
    usdc.nonces(owner),
  ])
  const deadline = Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS
  const domain   = {
    name,
    version: '2',
    chainId: CHAIN_ID,
    verifyingContract: ADDRESSES.USDC,
  }
  const types = {
    Permit: [
      { name: 'owner',    type: 'address' },
      { name: 'spender',  type: 'address' },
      { name: 'value',    type: 'uint256' },
      { name: 'nonce',    type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  }
  const message = { owner, spender, value: amount, nonce, deadline }
  const sig     = await signer.signTypedData(domain, types, message)
  const { v, r, s } = Signature.from(sig)
  return { v, r, s, deadline }
}
