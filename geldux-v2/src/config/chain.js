export const CHAIN_ID  = 84532
export const CHAIN_HEX = '0x14a34'

const ALCHEMY_KEY = import.meta.env.VITE_ALCHEMY_API_KEY

export const ALCHEMY_RPC = `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`
export const ALCHEMY_WS  = `wss://base-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`

export const RPC_LIST = [
  ALCHEMY_RPC,
  'https://sepolia.base.org',
  'https://base-sepolia-rpc.publicnode.com',
]

export const HERMES_URL = 'https://hermes.pyth.network'
export const EXPLORER   = 'https://sepolia.basescan.org'

export const BASE_CHAIN_PARAMS = {
  chainId:           CHAIN_HEX,
  chainName:         'Base Sepolia',
  rpcUrls:           RPC_LIST,
  nativeCurrency:    { name: 'Ether', symbol: 'ETH', decimals: 18 },
  blockExplorerUrls: [EXPLORER],
}

export const USDC_DECIMALS  = 18
export const PRICE_DECIMALS = 18  /* Pyth / PerpConfig prices are 1e18 per USD */

export const PERMIT_DEADLINE_SECONDS = 3600  /* 1 hour from now */
