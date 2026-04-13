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

/* Filter RPC_LIST to valid URLs before passing to MetaMask wallet_addEthereumChain.
   If VITE_ALCHEMY_API_KEY is absent the Alchemy URL ends in '/undefined' — passing
   that to MetaMask would cache a broken primary RPC in the user's wallet. */
const _validRpcs = RPC_LIST.filter((u) => !u.endsWith('/undefined') && !u.endsWith('/null'))
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
