export const CHAIN_ID  = 84532
export const CHAIN_HEX = '0x14a34'

const ALCHEMY_KEY = import.meta.env.VITE_ALCHEMY_API_KEY ?? ''

/* Guard: if VITE_ALCHEMY_API_KEY was set to a full URL instead of just the
   API key portion, use it directly rather than prepending the base URL again.
   Without this, setting the env var to the full https://...alchemy.com/v2/<key>
   produces the malformed double-URL "https://.../v2/https://..." which causes
   CORS failures and ERR_FAILED on every RPC call. */
function _buildAlchemyRpc() {
  if (!ALCHEMY_KEY) return null
  if (ALCHEMY_KEY.startsWith('https://') || ALCHEMY_KEY.startsWith('http://'))
    return ALCHEMY_KEY
  return `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`
}

export const ALCHEMY_RPC = _buildAlchemyRpc()
export const ALCHEMY_WS  = ALCHEMY_RPC ? ALCHEMY_RPC.replace(/^https?:\/\//, 'wss://') : null

export const RPC_LIST = [
  ALCHEMY_RPC,
  'https://sepolia.base.org',
  'https://base-sepolia-rpc.publicnode.com',
].filter(Boolean)

export const HERMES_URL = 'https://hermes.pyth.network'
export const EXPLORER   = 'https://sepolia.basescan.org'

/* Filter RPC_LIST to valid URLs before passing to MetaMask wallet_addEthereumChain.
   Excludes null entries, /undefined, /null, and any URL where the path itself
   contains a protocol (double-URL pattern). */
const _validRpcs = RPC_LIST.filter((u) => {
  if (!u) return false
  if (u.endsWith('/undefined') || u.endsWith('/null')) return false
  if (/\/https?:\/\//.test(u)) return false
  return true
})
export const BASE_CHAIN_PARAMS = {
  chainId:           CHAIN_HEX,
  chainName:         'Base Sepolia',
  rpcUrls:           _validRpcs.length ? _validRpcs : ['https://sepolia.base.org'],
  nativeCurrency:    { name: 'Ether', symbol: 'ETH', decimals: 18 },
  blockExplorerUrls: [EXPLORER],
}

/* NOTE: The testnet USDC deployed at ADDRESSES.USDC uses 18 decimals.
   Standard Circle USDC uses 6 decimals. All amount parsing in this repo
   uses parseUnits(..., 18) and all division uses 1e18. Do NOT change this
   without also updating every contract interaction that touches USDC amounts. */
export const USDC_DECIMALS  = 18
export const PRICE_DECIMALS = 18  /* Pyth / PerpConfig prices are 1e18 per USD */

export const PERMIT_DEADLINE_SECONDS = 3600  /* 1 hour from now */
