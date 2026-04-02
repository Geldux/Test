// ── ABI definitions ───────────────────────────────────────────────────────
// Extracted verbatim from legacy/index.html.
// Do NOT modify unless the on-chain contract interface changes.

// Shared ERC-20 ABI — matches USDC, ETHT, SOLT, BSLV contracts.
export const ABI_ERC20 = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function transfer(address,uint256) returns (bool)',
  'function transferFrom(address,address,uint256) returns (bool)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
]

// SpotDEX — key is indexed in Bought/Sold events.
export const ABI_SPOT = [
  'function buy(bytes32,uint256,uint256) returns (uint256)',
  'function sell(bytes32,uint256,uint256) returns (uint256)',
  'function quote(bytes32,bool,uint256) view returns (uint256,uint256,uint256)',
  'function getLiquidity(bytes32) view returns (uint256,uint256)',
  'function allMarketKeys() view returns (bytes32[])',
  'event Bought(address indexed,bytes32 indexed,uint256,uint256,uint256)',
  'event Sold(address indexed,bytes32 indexed,uint256,uint256,uint256)',
]

// BaseLovePerpDEX v2
export const ABI_PERP = [
  'function open(bytes32,bool,uint8,uint256) returns (uint256)',
  'function close(uint256) external',
  'function liquidate(uint256) external',
  'function liquidationPrice(uint256) view returns (uint256)',
  'function userPositions(address) view returns (uint256[])',
  'function getPosition(uint256) view returns (address,bytes32,bool,uint8,uint256,uint256,uint256,uint256)',
  'function unrealisedPnL(uint256) view returns (int256,uint256)',
  'function insuranceFund() view returns (uint256)',
  'function getPrice(bytes32) view returns (uint256)',
  'function assetActive(bytes32) view returns (bool)',
  'function assetPythId(bytes32) view returns (bytes32)',
  'event Opened(uint256 indexed,address indexed,bytes32,bool,uint8,uint256,uint256,uint256)',
  'event Closed(uint256 indexed,address indexed,int256,uint256,uint256)',
  'event Liquidated(uint256 indexed,address indexed,uint256)',
]

// Faucet
export const ABI_FAUCET = [
  'function claim() external',
  'function cooldownRemaining(address) view returns (uint256)',
  'function canClaim(address) view returns (bool)',
  'function getBalance() view returns (uint256)',
]

// Points / referrals
export const ABI_PTS = [
  'function register(bytes32,bytes32) external',
  'function getUserInfo(address) view returns (uint256,uint256,uint256,uint256,bytes32,address)',
]

// Pyth oracle
export const ABI_PYTH = [
  'function updatePriceFeeds(bytes[] calldata) payable external',
  'function getUpdateFee(bytes[] calldata) view external returns (uint256)',
]
