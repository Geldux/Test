/**
 * EIP-2612 Permit signing for USDC.
 *
 * signPermit(signer, spender, amount) → { v, r, s, deadline }
 *
 * Enables 1-click flows: the signed permit is passed directly to
 * openWithPermitAndPriceUpdate / increaseWithPermitAndPriceUpdate /
 * depositWithPermit — no separate approval transaction needed.
 *
 * NOTE: This service module is not currently imported by any hook.
 * The canonical permit implementation lives in src/hooks/useTrading.js.
 * Both implementations are kept consistent to avoid drift.
 */
import { Contract, Signature, TypedDataEncoder } from 'ethers'
import { CHAIN_ID, PERMIT_DEADLINE_SECONDS } from '@/config/chain'
import { ADDRESSES, ABI_USDC } from '@/config/contracts'

/**
 * @param {import('ethers').Signer} signer
 * @param {string}  spender   contract that will consume the permit
 * @param {bigint}  amount    token amount (18-decimal, matching testnet USDC)
 * @returns {{ v: number, r: string, s: string, deadline: number }}
 */
export async function signPermit(signer, spender, amount) {
  const owner = await signer.getAddress()

  /* Use the signer's own provider — most reliable for one-off reads */
  const usdcProv = signer.provider
  if (!usdcProv) throw new Error('[signPermit] signer has no provider')
  const usdcRead = new Contract(ADDRESSES.USDC, ABI_USDC, usdcProv)

  /* Fetch name and on-chain DOMAIN_SEPARATOR in parallel */
  const [name, onChainSep] = await Promise.all([
    usdcRead.name().catch(() => 'USD Coin'),
    usdcRead.DOMAIN_SEPARATOR().catch(() => null),
  ])

  /* Fetch nonce — try signer provider first, then 0n */
  let nonce = 0n
  try {
    nonce = await usdcRead.nonces(owner)
  } catch (_) {
    console.warn('[signPermit] nonces() failed, using 0n — check USDC ABI or provider')
  }

  /* Auto-detect EIP-712 domain by hashing each candidate and comparing to on-chain value.
     Priority: version='1' (most custom tokens) > version='2' (Circle USDC) > no version */
  const candidates = [
    { name, version: '1', chainId: CHAIN_ID, verifyingContract: ADDRESSES.USDC },
    { name, version: '2', chainId: CHAIN_ID, verifyingContract: ADDRESSES.USDC },
    { name,               chainId: CHAIN_ID, verifyingContract: ADDRESSES.USDC },
  ]
  let domain = candidates[0]
  if (onChainSep) {
    console.log('[signPermit] on-chain DOMAIN_SEPARATOR:', onChainSep)
    for (const c of candidates) {
      try {
        const computed = TypedDataEncoder.hashDomain(c)
        console.log('[signPermit] candidate', JSON.stringify({ ...c, chainId: Number(c.chainId) }), '→', computed)
        if (computed.toLowerCase() === onChainSep.toLowerCase()) {
          domain = c
          console.log('[signPermit] DOMAIN MATCHED ✓', JSON.stringify({ ...domain, chainId: Number(domain.chainId) }))
          break
        }
      } catch (_) {}
    }
    if (domain === candidates[0]) {
      console.warn('[signPermit] ⚠ no candidate matched on-chain separator — using version=1 default')
    }
  }

  const deadline = Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS
  const types    = {
    Permit: [
      { name: 'owner',    type: 'address' },
      { name: 'spender',  type: 'address' },
      { name: 'value',    type: 'uint256' },
      { name: 'nonce',    type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  }
  const message  = { owner, spender, value: amount, nonce, deadline }

  console.log('[signPermit] domain:', JSON.stringify({ ...domain, chainId: Number(domain.chainId) }))
  console.log('[signPermit] owner:', owner, '| spender:', spender, '| nonce:', nonce.toString())

  const sig      = await signer.signTypedData(domain, types, message)
  const { v, r, s } = Signature.from(sig)
  return { v, r, s, deadline }
}
