export const CHAIN_ID  = 84532
export const CHAIN_HEX = '0x14a34'

const _PRIMARY_RAW   = import.meta.env.VITE_PRIMARY_RPC   ?? ''
const _SECONDARY_RAW = import.meta.env.VITE_SECONDARY_RPC ?? ''

/* Accept full https/http URLs only. Rejects empty, 'null', 'undefined',
   accidentally doubled URLs (https://https://…), and trailing placeholders. */
function _sanitise(raw) {
  if (!raw) return null
  const s = raw.trim()
  if (!s || s === 'null' || s === 'undefined') return null
  if (!s.startsWith('https://') && !s.startsWith('http://')) return null
  if (/\/https?:\/\//.test(s)) return null
  if (s.endsWith('/undefined') || s.endsWith('/null')) return null
  return s
}

const PRIMARY_RPC   = _sanitise(_PRIMARY_RAW)
const SECONDARY_RPC = _sanitise(_SECONDARY_RAW)

/* True when at least one private RPC is configured — enables extended lookback. */
export const HAS_DEDICATED_RPC   = Boolean(PRIMARY_RPC || SECONDARY_RPC)
export const HAS_ALCHEMY_HISTORY = HAS_DEDICATED_RPC   /* alias used by useHistory */

const _PUBLIC = [
  'https://sepolia.base.org',
  'https://base-sepolia-rpc.publicnode.com',
]

/* primary → secondary → public last-resort fallbacks */
export const READ_RPC_LIST    = [PRIMARY_RPC, SECONDARY_RPC, ..._PUBLIC].filter(Boolean)
export const HISTORY_RPC_LIST = READ_RPC_LIST
export const RPC_LIST         = READ_RPC_LIST   /* backwards-compat alias */

export const HERMES_URL = 'https://hermes.pyth.network'
export const EXPLORER   = 'https://sepolia.basescan.org'

const _validRpcs = READ_RPC_LIST.filter((u) =>
  u && !u.endsWith('/undefined') && !u.endsWith('/null') && !/\/https?:\/\//.test(u)
)
export const BASE_CHAIN_PARAMS = {
  chainId:           CHAIN_HEX,
  chainName:         'Base Sepolia',
  rpcUrls:           _validRpcs.length ? _validRpcs : ['https://sepolia.base.org'],
  nativeCurrency:    { name: 'Ether', symbol: 'ETH', decimals: 18 },
  blockExplorerUrls: [EXPLORER],
}

/* GelduxUSDC uses 6 decimals (standard ERC-20 USDC). All amount parsing
   uses parseUnits(..., 6) and all division uses 1e6. */
export const USDC_DECIMALS  = 6
export const PRICE_DECIMALS = 18  /* Pyth / PerpConfig prices are 1e18 per USD */

export const PERMIT_DEADLINE_SECONDS = 3600  /* 1 hour from now */
