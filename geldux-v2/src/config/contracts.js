/* ── Contract Addresses ────────────────────────────────────────────────── */
export const ADDRESSES = {
  PERP_CORE:       '0x82a475082618aAbeD4087F3F36DDCeDD1A904c92',
  PERP_CONFIG:     '0x7A5cbCC2e50F40dF5Fc2e723F068857919a08689',
  PERP_VAULT:      '0x3d47Fb518F9DcE0ea539f340d2aC38a558781F21',
  PERP_STORE:      '0x84c1bfe158Bc200fd9Fd9d4099Dba79f8A44b007',
  PERP_LIQUIDATOR: '0x5daEcC463f7AeD3CaC7FCd39eEfDfB08A2b0E9D7',
  ORDER_MANAGER:   '0xC575622f1D1B3ED658c8c78Ea4fA0133bfBB61d0',
  CROSS_MARGIN:    '0x96fD349713faA853cc0453a01C89EcA49ec9fA46',
  USDC:            '0xA60523f6664309155FDa3C3b1bECDB2b420e52E3',
  PYTH:            '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
  SPOT_DEX:        '0x4D73a7F4d53E8b0D6616cb20E7eE97F09fCC2591',
  FAUCET:          '0xea356c907aC8Aa7e66F09469C51f2416f16553Db',
}

/* ── ERC-20 + EIP-2612 Permit ABI ─────────────────────────────────────── */
export const ABI_USDC = [
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function nonces(address) view returns (uint256)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
]

/* ── Pyth Oracle ABI ──────────────────────────────────────────────────── */
export const ABI_PYTH = [
  'function getUpdateFee(bytes[] calldata updateData) view returns (uint256)',
  'function getPriceUnsafe(bytes32 id) view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))',
  'function getPrice(bytes32 id) view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))',
  'function updatePriceFeeds(bytes[] calldata updateData) payable',
]

/* ── PerpCore ABI ─────────────────────────────────────────────────────── */
export const ABI_PERP_CORE = [
  /* 1-signature open: permit + pyth update + open in one tx */
  'function openWithPermitAndPriceUpdate(bytes32 key, bool isLong, uint8 leverage, uint256 collateral, bool reduceOnly, uint256 deadline, uint8 v, bytes32 r, bytes32 s, bytes[] calldata updateData) external payable returns (uint256 posId)',
  /* 1-signature increase */
  'function increaseWithPermitAndPriceUpdate(uint256 posId, uint256 collateral, uint8 leverage, uint256 deadline, uint8 v, bytes32 r, bytes32 s, bytes[] calldata updateData) external payable',
  /* Close (pyth update + close in one tx) */
  'function closeWithPriceUpdate(uint256 posId, bytes[] calldata updateData) external payable',
  /* Partial close */
  'function partialCloseWithPriceUpdate(uint256 posId, uint256 collateralDelta, bytes[] calldata updateData) external payable',
  /* Events */
  'event Opened(uint256 indexed posId, address indexed owner, bytes32 indexed key, bool isLong, uint8 leverage, uint256 collateral)',
  'event Closed(uint256 indexed posId, int256 pnl)',
]

/* ── PerpConfig ABI ───────────────────────────────────────────────────── */
export const ABI_PERP_CONFIG = [
  'function getMarkPrice(bytes32 key) view returns (uint256)',
  'function getIndexPrice(bytes32 key) view returns (uint256)',
  'function getFundingRate(bytes32 key) view returns (int256)',
  'function getOpenInterest(bytes32 key) view returns (uint256 longOI, uint256 shortOI)',
  'function getAsset(bytes32 key) view returns (tuple(bytes32 key, string symbol, bool active, uint8 maxLeverage, uint256 maintenanceMargin, uint256 openFee, uint256 closeFee))',
  'function getAllMarkPrices() view returns (bytes32[] memory keys, uint256[] memory prices)',
]

/* ── PerpStore ABI ────────────────────────────────────────────────────── */
export const ABI_PERP_STORE = [
  'function getPosition(uint256 posId) view returns (tuple(uint256 id, address owner, bytes32 key, bool isLong, uint8 leverage, uint256 collateral, uint256 size, uint256 entryPrice, uint256 openTime, bool isOpen))',
  'function getUserPositions(address user) view returns (uint256[] memory)',
  'function getPositionCount() view returns (uint256)',
]

/* ── PerpVault ABI ────────────────────────────────────────────────────── */
export const ABI_PERP_VAULT = [
  'function freeBalance() view returns (uint256)',
  'function reservedCollateral() view returns (uint256)',
  'function insuranceBalance() view returns (uint256)',
  'function netPnl() view returns (int256)',
  'function totalDeposited() view returns (uint256)',
]

/* ── OrderManager ABI ────────────────────────────────────────────────── */
export const ABI_ORDER_MANAGER = [
  'function createLimitOrder(bytes32 key, bool isLong, uint8 leverage, uint256 collateral, uint256 triggerPrice) returns (uint256 orderId)',
  'function createStopLoss(uint256 posId, uint256 triggerPrice) returns (uint256 orderId)',
  'function createTakeProfit(uint256 posId, uint256 triggerPrice) returns (uint256 orderId)',
  'function cancelOrder(uint256 orderId)',
  'function getUserOrders(address user) view returns (tuple(uint256 id, address owner, bytes32 key, bool isLong, uint8 leverage, uint256 collateral, uint256 triggerPrice, uint8 orderType, uint256 posId, bool active)[] memory)',
  'event OrderCreated(uint256 indexed orderId, address indexed owner)',
  'event OrderCancelled(uint256 indexed orderId)',
  'event OrderFilled(uint256 indexed orderId)',
]

/* ── CrossMargin ABI ─────────────────────────────────────────────────── */
export const ABI_CROSS_MARGIN = [
  'function depositWithPermit(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function withdraw(uint256 amount)',
  'function getAccount(address user) view returns (tuple(uint256 equity, uint256 usedMargin, int256 unrealizedPnl, uint256 freeMargin))',
  'function openCrossWithPriceUpdate(bytes32 key, bool isLong, uint8 leverage, uint256 notionalSize, bytes[] calldata updateData) external payable',
  'function closeCrossWithPriceUpdate(uint256 posId, bytes[] calldata updateData) external payable',
]

/* ── Faucet ABI ──────────────────────────────────────────────────────── */
export const ABI_FAUCET = [
  'function claim()',
  'function canClaim(address) view returns (bool)',
  'function cooldownRemaining(address) view returns (uint256)',
  'function getBalance() view returns (uint256)',
]
