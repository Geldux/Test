/* ── Contract Addresses ─────────────────────────────────────────────────── */
export const ADDRESSES = {
  PERP_CORE:       '0x82a475082618aAbeD4087F3F36DDCeDD1A904c92',
  PERP_CONFIG:     '0x7A5cbCC2e50F40dF5Fc2e723F068857919a08689',
  PERP_VAULT:      '0x3d47Fb518F9DcE0ea539f340d2aC38a558781F21',
  PERP_STORE:      '0x84c1bfe158Bc200fd9Fd9d4099Dba79f8A44b007',
  PERP_LIQUIDATOR: '0x5daEcC463f7AeD3CaC7FCd39eEfDfB08A2b0E9D7',
  ORDER_MANAGER:   '0xC575622f1D1B3ED658c8c78Ea4fA0133bfBB61d0',
  CROSS_MARGIN:    '0x96fD349713faA853cc0453a01C89EcA49ec9fA46',
  USDC:            '0x617b90652e30cd88f944decccb69441d8ce64a8c',
  PYTH:            '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
  FAUCET:          '0x3C2Cd8b05d6e31679ac1C04594583ba4CCD4445f',
}

/* ── ERC-20 + EIP-2612 Permit ABI ──────────────────────────────────────── */
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

/* ── Pyth Oracle ABI ───────────────────────────────────────────────────── */
export const ABI_PYTH = [
  'function getUpdateFee(bytes[] calldata updateData) view returns (uint256)',
  'function getPriceUnsafe(bytes32 id) view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))',
  'function getPrice(bytes32 id) view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))',
  'function updatePriceFeeds(bytes[] calldata updateData) payable',
]

/* ── PerpCore ABI ──────────────────────────────────────────────────────── */
export const ABI_PERP_CORE = [
  /* 1-sig open: sign permit → pyth update → open, all in one tx */
  'function openWithPermitAndPriceUpdate(bytes32 key, bool isLong, uint8 leverage, uint256 collateral, bool reduceOnly, uint256 deadline, uint8 v, bytes32 r, bytes32 s, bytes[] calldata updateData) external payable returns (uint256 posId)',
  /* 1-sig increase: sign permit → pyth update → increase, all in one tx */
  'function increaseWithPermitAndPriceUpdate(uint256 posId, uint256 extra, uint256 deadline, uint8 v, bytes32 r, bytes32 s, bytes[] calldata updateData) external payable',
  /* Close: pyth update + close in one tx */
  'function closeWithPriceUpdate(uint256 posId, bytes[] calldata updateData) external payable',
  /* Partial close */
  'function partialCloseWithPriceUpdate(uint256 posId, uint256 collateralDelta, bytes[] calldata updateData) external payable',
  /* Events */
  'event Opened(uint256 indexed posId, address indexed owner, bytes32 indexed key, bool isLong, uint8 leverage, uint256 collateral)',
  'event Closed(uint256 indexed posId, int256 pnl)',
]

/* ── PerpConfig ABI ────────────────────────────────────────────────────── */
export const ABI_PERP_CONFIG = [
  /* Price queries — getMarkPrice requires forLong bool */
  'function getMarkPrice(bytes32 key, bool forLong) view returns (uint256)',
  'function getIndexPrice(bytes32 key) view returns (uint256)',
  /* Funding */
  'function computeFundingRate(bytes32 key) view returns (int256)',
  'function getFundingState(bytes32 k) view returns (tuple(int256 cumulativeIndex, uint256 lastUpdateTime, uint256 longOI, uint256 shortOI))',
  'function getFundingIndex(bytes32 k) view returns (int256)',
  'function pendingFundingForPosition(bytes32 key, uint256 size, bool isLong, int256 entry) view returns (int256)',
  /* Open interest */
  'function getOI(bytes32 k) view returns (uint256 lo, uint256 so)',
  /* Asset config */
  'function getAsset(bytes32 k) view returns (tuple(bytes32 pythId, bool active, uint8 maxLeverage, uint256 maxOI, uint256 maxSkew, uint256 maxPositionSize, uint256 initialMarginBps, uint256 maintenanceMarginBps))',
  'function validateAndGetAsset(bytes32 k) view returns (tuple(bytes32 pythId, bool active, uint8 maxLeverage, uint256 maxOI, uint256 maxSkew, uint256 maxPositionSize, uint256 initialMarginBps, uint256 maintenanceMarginBps))',
  'function allAssetKeys(uint256) view returns (bytes32)',
  'function totalAssets() view returns (uint256)',
  /* Risk params */
  'function feeBps() view returns (uint256)',
  'function liquidationBonusBps() view returns (uint256)',
  'function priceAge() view returns (uint256)',
]

/* ── PerpStore ABI ─────────────────────────────────────────────────────── */
export const ABI_PERP_STORE = [
  /* Position queries — struct fields: owner, assetKey, isLong, reduceOnly,
     leverage, collateral, size, entryPrice, openTime, fundingEntry */
  'function getPosition(uint256 posId) view returns (tuple(address owner, bytes32 assetKey, bool isLong, bool reduceOnly, uint8 leverage, uint256 collateral, uint256 size, uint256 entryPrice, uint256 openTime, int256 fundingEntry))',
  'function positionExists(uint256 posId) view returns (bool)',
  'function getUserPositions(address user) view returns (uint256[])',
  'function nextPositionId() view returns (uint256)',
]

/* ── PerpVault ABI ─────────────────────────────────────────────────────── */
export const ABI_PERP_VAULT = [
  'function freeBalance() view returns (uint256)',
  'function reservedCollateral() view returns (uint256)',
  'function insuranceBalance() view returns (uint256)',
  'function feeBalance() view returns (uint256)',
  'function netUnrealizedPnl() view returns (int256)',
  'function maxWithdrawable() view returns (uint256)',
  'function protocolHealth() view returns (uint256 free_, int256 pnl, uint256 safe_)',
]

/* ── OrderManager ABI ─────────────────────────────────────────────────── */
export const ABI_ORDER_MANAGER = [
  /* Create orders — all are payable (execution fee in ETH) */
  'function createLimitOrder(bytes32 assetKey, bool isLong, uint8 leverage, uint256 collateral, bool reduceOnly, uint256 triggerPrice) external payable returns (uint256)',
  'function createStopLoss(uint256 posId, uint256 triggerPrice, uint256 fractionBps) external payable returns (uint256)',
  'function createTakeProfit(uint256 posId, uint256 triggerPrice, uint256 fractionBps) external payable returns (uint256)',
  'function cancelOrder(uint256 orderId)',
  /* Queries */
  'function getOrder(uint256 id) view returns (tuple(uint256 id, address trader, bytes32 assetKey, uint8 orderType, bool isLong, uint8 leverage, uint256 collateral, bool reduceOnly, uint256 posId, uint256 fractionBps, uint256 triggerPrice, bool triggerAbove, bool active, uint256 createdAt, uint256 executionFee))',
  'function traderOrders(address t) view returns (uint256[])',
  'function minExecFee() view returns (uint256)',
  'function nextOrderId() view returns (uint256)',
  /* Events */
  'event OrderCreated(uint256 indexed id, address indexed trader, uint8 indexed t)',
  'event OrderCancelled(uint256 indexed id, address indexed trader)',
  'event OrderExecuted(uint256 indexed id, address indexed keeper, uint256 fee)',
  'event OrderFailed(uint256 indexed id, string reason)',
]

/* ── CrossMarginManager ABI ───────────────────────────────────────────── */
export const ABI_CROSS_MARGIN = [
  /* Deposits / withdrawals */
  'function deposit(uint256 amt)',
  'function depositWithPermit(uint256 amt, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function withdraw(uint256 amt)',
  /* Position management */
  'function openPosition(bytes32 key, bool isLong, uint8 leverage, uint256 collateral, bool reduceOnly) returns (uint256 posId)',
  'function increasePosition(uint256 posId, uint256 extra)',
  'function closePosition(uint256 posId, uint256 fracBps)',
  /* Account queries */
  'function getAccount(address trader) view returns (uint256 balance, uint256[] posIds)',
  'function accountEquity(address trader) view returns (int256)',
  'function accountMM(address trader) view returns (uint256)',
  'function accountOwnerOf(uint256 posId) view returns (address)',
  'function isLiquidatable(address trader) view returns (bool)',
  /* Events */
  'event Deposited(address indexed t, uint256 amt)',
  'event Withdrawn(address indexed t, uint256 amt)',
  'event PositionOpened(address indexed t, uint256 indexed posId, bytes32 key)',
  'event PositionClosed(address indexed t, uint256 indexed posId, uint256 payout)',
  'event PositionIncreased(address indexed t, uint256 indexed posId, uint256 extra)',
]

/* ── Faucet ABI ───────────────────────────────────────────────────────── */
export const ABI_FAUCET = [
  'function claim()',
  'function canClaim(address user) view returns (bool)',
  'function cooldownRemaining(address user) view returns (uint256)',
  'function faucetBalance() view returns (uint256)',
  'function claimAmount() view returns (uint256)',
  'function cooldownPeriod() view returns (uint256)',
]
