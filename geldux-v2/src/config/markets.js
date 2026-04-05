import { keccak256, toUtf8Bytes } from 'ethers'

/* Pyth price feed IDs (Base Sepolia) */
export const PYTH_IDS = {
  BTC:  '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH:  '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL:  '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
}

/* Market asset keys = keccak256(symbol) — must match on-chain PerpConfig */
export const ASSET_KEYS = {
  BTC: keccak256(toUtf8Bytes('BTC')),
  ETH: keccak256(toUtf8Bytes('ETH')),
  SOL: keccak256(toUtf8Bytes('SOL')),
}

export const MARKETS = [
  { sym: 'BTC', name: 'Bitcoin',  maxLev: 50, pythId: PYTH_IDS.BTC, key: ASSET_KEYS.BTC },
  { sym: 'ETH', name: 'Ethereum', maxLev: 50, pythId: PYTH_IDS.ETH, key: ASSET_KEYS.ETH },
  { sym: 'SOL', name: 'Solana',   maxLev: 20, pythId: PYTH_IDS.SOL, key: ASSET_KEYS.SOL },
]

export const LEVERAGE_MARKS = [1, 2, 5, 10, 20, 50]
