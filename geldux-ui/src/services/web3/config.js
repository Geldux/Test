import { keccak256, toUtf8Bytes } from 'ethers'

// ── Alchemy ───────────────────────────────────────────────────────────────
// Set VITE_ALCHEMY_API_KEY in your .env file.
const ALCHEMY_KEY = import.meta.env.VITE_ALCHEMY_API_KEY

export const ALCHEMY_RPC = `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`
export const ALCHEMY_WS  = `wss://base-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`

// ── RPC rotation ─────────────────────────────────────────────────────────
export const RPC_LIST = [
  ALCHEMY_RPC,
  'https://sepolia.base.org',
  'https://base-sepolia-rpc.publicnode.com',
]

// ── Chain ─────────────────────────────────────────────────────────────────
export const CHAIN_ID  = 84532
export const CHAIN_HEX = '0x14a34'

// ── Explorer ──────────────────────────────────────────────────────────────
export const EXPLORER = 'https://sepolia.basescan.org'

export const BASE_CHAIN_PARAMS = {
  chainId:           CHAIN_HEX,
  chainName:         'Base Sepolia',
  rpcUrls:           RPC_LIST,
  nativeCurrency:    { name: 'Ether', symbol: 'ETH', decimals: 18 },
  blockExplorerUrls: [EXPLORER],
}

// ── Pyth Hermes endpoint ──────────────────────────────────────────────────
export const HERMES = 'https://hermes.pyth.network'

// ── Pyth price feed IDs ───────────────────────────────────────────────────
export const PYTH_IDS = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
}

// ── Contract addresses — Base Sepolia ─────────────────────────────────────
export const ADDRESSES = {
  USDC:   '0xA60523f6664309155FDa3C3b1bECDB2b420e52E3', // 18-decimal USDC
  BSLV:   '0x9b3D2d075a24cbefE2d1CE8d4e3292fFf024114c',
  ETHT:   '0x3eB258344Cb3b70845D44E9c5180450db346a1E1', // ETH_TKN
  SOLT:   '0x2DBF9E7503b8573edbc4393F266a91039959cCdF', // SOL_TKN
  SPOT:   '0x4D73a7F4d53E8b0D6616cb20E7eE97F09fCC2591', // SpotDEX
  PERP:   '0xa4949ed2d7cfA69aAF4724bC465b635eEEc96550', // BaseLovePerpDEX v2
  PTS:    '0x8CaD38a9f47e4b62E4A4148e77c597DDC06cAB43',
  PYTH:   '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
  FAUCET: '0xea356c907aC8Aa7e66F09469C51f2416f16553Db',
}

// ── Token decimals ────────────────────────────────────────────────────────
// All BaseLove contracts use 18-decimal USDC. Confirmed at runtime in legacy
// via contract.decimals() — keep in sync if the token ever changes.
export const USDC_DECIMALS = 18

// ── Market keys — keccak256(symbol), must match on-chain contract ─────────
// BTC is computed dynamically (identical to legacy behaviour).
// ETH/SOL/BSLV are hardcoded from the verified on-chain values.
export const MARKET_KEYS = {
  BTC:  keccak256(toUtf8Bytes('BTC')),
  ETH:  '0xaaaebeba3810b1e6b70781f14b2d72c1cb89c0b2b320c43bb67ff79f562f5ff4',
  SOL:  '0x0a3ec4fc70eaf64faf6eeda4e9b2bd4742a785464053aa23afad8bd24650e86f',
  BSLV: '0xd09dcec5331053ca2c60597f057e839c9f1800bf8b849375896dd320c09b2ed2',
}
