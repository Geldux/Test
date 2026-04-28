/* Pyth price feed IDs (Base Sepolia) */
export const PYTH_IDS = {
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
}

/* Asset keys — match on-chain GelduxPerpCore values exactly */
export const ASSET_KEYS = {
  ETH: '0xaaaebeba3810b1e6b70781f14b2d72c1cb89c0b2b320c43bb67ff79f562f5ff4',
  SOL: '0x0a3ec4fc70eaf64faf6eeda4e9b2bd4742a785464053aa23afad8bd24650e86f',
}

export const MARKETS = [
  { sym: 'ETH', name: 'Ethereum', maxLev: 50, pythId: PYTH_IDS.ETH, key: ASSET_KEYS.ETH },
  { sym: 'SOL', name: 'Solana',   maxLev: 20, pythId: PYTH_IDS.SOL, key: ASSET_KEYS.SOL },
]

export const LEVERAGE_MARKS = [1, 2, 5, 10, 20, 50]
