export const CHAIN_ID  = 84532
export const CHAIN_HEX = '0x14a34'

const _READ_RAW    = import.meta.env.VITE_ALCHEMY_READ_RPC    ?? ''
const _HISTORY_RAW = import.meta.env.VITE_ALCHEMY_HISTORY_RPC ?? ''

/* Accept a full HTTPS URL or a bare API key (bare key → build URL).
   Guards against the double-URL pattern that produces malformed RPC addresses. */
function _sanitise(raw) {
  if (!raw) return null
  if (raw.startsWith('https://') || raw.startsWith('http://')) return raw
  return `https://base-sepolia.g.alchemy.com/v2/${raw}`
}

const ALCHEMY_READ_RPC    = _sanitise(_READ_RAW)
const ALCHEMY_HISTORY_RPC = _sanitise(_HISTORY_RAW)

/* True when a dedicated history/event RPC is configured — enables larger lookback. */
export const HAS_ALCHEMY_HISTORY = Boolean(ALCHEMY_HISTORY_RPC)

const _PUBLIC = [
  'https://sepolia.base.org',
  'https://base-sepolia-rpc.publicnode.com',
]

/* Normal reads: prefer read RPC → history RPC → public fallbacks */
export const READ_RPC_LIST = [
  ALCHEMY_READ_RPC,
  ALCHEMY_HISTORY_RPC,
  ..._PUBLIC,
].filter(Boolean)

/* History / event queries: prefer history RPC → read RPC → public fallbacks */
export const HISTORY_RPC_LIST = [
  ALCHEMY_HISTORY_RPC,
  ALCHEMY_READ_RPC,
  ..._PUBLIC,
].filter(Boolean)

/* Backwards-compat alias — all existing imports of RPC_LIST continue to work. */
export const RPC_LIST = READ_RPC_LIST

export const HERMES_URL = 'https://hermes.pyth.network'
export const EXPLORER   = 'https://sepolia.basescan.org'

/* Filter to URLs safe to pass to MetaMask wallet_addEthereumChain. */
const _validRpcs = READ_RPC_LIST.filter((u) => {
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
