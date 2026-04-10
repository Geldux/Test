/**
 * EIP-2612 Permit signing for USDC.
 *
 * signPermit(signer, spender, amount) → { v, r, s, deadline }
 *
 * Enables 1-click flows: the signed permit is passed directly to
 * openWithPermitAndPriceUpdate / increaseWithPermitAndPriceUpdate /
 * depositWithPermit — no separate approval transaction needed.
 */
import { Contract, Signature, JsonRpcProvider } from 'ethers'
import { CHAIN_ID, PERMIT_DEADLINE_SECONDS, RPC_LIST } from '@/config/chain'
import { ADDRESSES, ABI_USDC } from '@/config/contracts'

function getReadProvider() {
  const urls = RPC_LIST.filter((u) => !u.endsWith('/undefined') && !u.endsWith('/null'))
  for (const url of (urls.length ? urls : RPC_LIST)) {
    try { return new JsonRpcProvider(url) } catch (_) {}
  }
  return null
}

/**
 * @param {import('ethers').Signer} signer
 * @param {string}  spender   contract that will consume the permit
 * @param {bigint}  amount    token amount in wei (18-decimal)
 * @returns {{ v: number, r: string, s: string, deadline: number }}
 */
export async function signPermit(signer, spender, amount) {
  const usdc    = new Contract(ADDRESSES.USDC, ABI_USDC, signer)
  const owner   = await signer.getAddress()

  /* Fetch name + version; version fallback is '1' (standard default for custom tokens) */
  const [name, version] = await Promise.all([
    usdc.name().catch(() => 'USD Coin'),
    usdc.version().catch(() => '1'),
  ])

  /* Fetch nonce: try signer provider first, fall back to read provider, then 0n */
  let nonce = 0n
  try {
    nonce = await usdc.nonces(owner)
  } catch (_signerErr) {
    try {
      const rp = getReadProvider()
      if (rp) {
        const usdcRp = new Contract(ADDRESSES.USDC, ABI_USDC, rp)
        nonce = await usdcRp.nonces(owner)
        console.log('[signPermit] nonce via read provider:', nonce.toString())
      }
    } catch (_rpErr) {
      console.warn('[signPermit] nonces() failed on both providers, using 0n')
    }
  }

  const deadline = Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS
  const domain   = {
    name,
    version,
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
  console.log('[signPermit] domain:', JSON.stringify({ ...domain, chainId: Number(domain.chainId) }))
  console.log('[signPermit] owner:', owner, '| spender:', spender, '| nonce:', nonce.toString())
  const sig     = await signer.signTypedData(domain, types, message)
  const { v, r, s } = Signature.from(sig)
  return { v, r, s, deadline }
}
