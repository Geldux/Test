import GelduxUSDC_ABI       from '@/abis/GelduxUSDC.json'
import GelduxOracle_ABI     from '@/abis/GelduxOracle.json'
import GelduxVault_ABI      from '@/abis/GelduxVault.json'
import GelduxPerpCore_ABI   from '@/abis/GelduxPerpCore.json'
import GelduxOrderRouter_ABI from '@/abis/GelduxOrderRouter.json'

/* ── Contract Addresses (Geldux Perp V2 — Base Sepolia) ─────────────── */
export const ADDRESSES = {
  USDC:   '0x8b7a9CFF3dAf65252ED17752A2c7B647B17c37b9',
  ORACLE: '0x42123C253e3F5e17cf2CE3FdD3CA76F5036Fd493',
  VAULT:  '0xAE91cbF03Daa504b4662c46268b43bBC2901199f',
  CORE:   '0x5550720caF381C42ba0094FC2768A4c3329f1918',
  ROUTER: '0xD92818D7E128f0B30B7F6E234D1048Fd173f5782',
  PYTH:   '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
  /* Legacy aliases — all point to nearest V2 equivalent */
  PERP_CORE:    '0x5550720caF381C42ba0094FC2768A4c3329f1918',
  PERP_VAULT:   '0xAE91cbF03Daa504b4662c46268b43bBC2901199f',
  PERP_CONFIG:  '0x42123C253e3F5e17cf2CE3FdD3CA76F5036Fd493',
  PERP_STORE:   '0x5550720caF381C42ba0094FC2768A4c3329f1918',
  ORDER_MANAGER:'0xD92818D7E128f0B30B7F6E234D1048Fd173f5782',
  CROSS_MARGIN: '0x5550720caF381C42ba0094FC2768A4c3329f1918',
  FAUCET:       '0x8b7a9CFF3dAf65252ED17752A2c7B647B17c37b9',
}

/* ── V2 ABIs ─────────────────────────────────────────────────────────── */
export const ABI_USDC   = GelduxUSDC_ABI
export const ABI_ORACLE = GelduxOracle_ABI
export const ABI_VAULT  = GelduxVault_ABI
export const ABI_PERP_CORE = GelduxPerpCore_ABI
export const ABI_ROUTER    = GelduxOrderRouter_ABI

/* Minimal Pyth ABI (still used by usePrices for direct Hermes VAA fee check fallback) */
export const ABI_PYTH = [
  'function getUpdateFee(bytes[] calldata updateData) view returns (uint256)',
  'function getPriceUnsafe(bytes32 id) view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))',
  'function getPrice(bytes32 id) view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))',
  'function updatePriceFeeds(bytes[] calldata updateData) payable',
]

/* Legacy stubs — keep exports so existing imports don't break the build */
export const ABI_PERP_CONFIG  = []
export const ABI_PERP_STORE   = []
export const ABI_ORDER_MANAGER = []
export const ABI_CROSS_MARGIN  = []
export const ABI_FAUCET        = []
export const ABI_SPOT_DEX      = []
export const ABI_PERP_VAULT    = []
