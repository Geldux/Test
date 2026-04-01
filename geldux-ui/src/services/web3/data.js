/**
 * data.js
 *
 * Account data loading: balances, positions, points, faucet.
 *
 * Extracted from legacy/index.html — behaviour preserved exactly.
 * No UI wiring.
 *
 * Public API
 *   loadBal()                  fetch token balances for the connected account
 *   loadPos()                  fetch open perpetual positions
 *   loadPts()                  fetch points / referral info
 *   regPts(myCode, refCode)    register referral code
 *   claimFaucet()              claim testnet faucet
 *   getFauCd()                 get faucet cooldown seconds remaining
 */

import {
  Contract,
  formatUnits,
  encodeBytes32String,
  decodeBytes32String,
  ZeroHash,
} from 'ethers'
import {
  ADDRESSES,
  MARKET_KEYS,
  USDC_DECIMALS,
  ALCHEMY_RPC,
} from './config.js'
import { ABI_ERC20, ABI_PERP, ABI_FAUCET, ABI_PTS } from './contracts.js'
import { getReadProvider, getAccount, cPTS, cFAU } from './wallet.js'
import { waitTx } from './tx.js'

// Reverse map: market key hex → symbol name.
// Built once at module load from MARKET_KEYS.
const KEY_TO_SYM = Object.fromEntries(
  Object.entries(MARKET_KEYS).map(([sym, key]) => [key, sym]),
)

// ── alchemyGetTokenBalances (private) ─────────────────────────────────────
// Fetches token balances for `account` via Alchemy's `alchemy_getTokenBalances`
// JSON-RPC method.  Returns null on any error.
//
// Mirrors legacy async function alchemyGetTokenBalances(account).

async function _alchemyGetTokenBalances(account) {
  const tokens = [ADDRESSES.USDC, ADDRESSES.ETHT, ADDRESSES.SOLT, ADDRESSES.BSLV]
  try {
    const resp = await fetch(ALCHEMY_RPC, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        jsonrpc: '2.0',
        id:      1,
        method:  'alchemy_getTokenBalances',
        params:  [account, tokens],
      }),
      signal: AbortSignal.timeout(6000),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data?.result?.tokenBalances ?? null
  } catch (_e) {
    return null
  }
}

// ── loadBal ───────────────────────────────────────────────────────────────
// Returns token balances for the connected account as human-readable numbers:
//   { USDC, ETH_TKN, SOL_TKN, BSLV }
//
// Primary: Alchemy `alchemy_getTokenBalances` batch call.
// Fallback: individual `balanceOf()` calls via read provider.
//
// Mirrors legacy async function loadBal().

export async function loadBal() {
  const account = getAccount()
  if (!account) throw new Error('[data] Wallet not connected')

  const rp = getReadProvider()

  // ── Primary: Alchemy batch ────────────────────────────────────────────
  const alchemyBals = await _alchemyGetTokenBalances(account)

  if (alchemyBals) {
    const tokens = [ADDRESSES.USDC, ADDRESSES.ETHT, ADDRESSES.SOLT, ADDRESSES.BSLV]
    const keys   = ['USDC', 'ETH_TKN', 'SOL_TKN', 'BSLV']
    const result = {}

    for (let i = 0; i < tokens.length; i++) {
      const entry = alchemyBals.find(
        (b) => b.contractAddress?.toLowerCase() === tokens[i].toLowerCase(),
      )
      const raw = entry ? BigInt(entry.tokenBalance ?? '0x0') : 0n
      result[keys[i]] = Number(formatUnits(raw, USDC_DECIMALS))
    }

    return result
  }

  // ── Fallback: individual balanceOf ────────────────────────────────────
  if (!rp) throw new Error('[data] No read provider available')

  const contracts = {
    USDC:    new Contract(ADDRESSES.USDC,  ABI_ERC20, rp),
    ETH_TKN: new Contract(ADDRESSES.ETHT,  ABI_ERC20, rp),
    SOL_TKN: new Contract(ADDRESSES.SOLT,  ABI_ERC20, rp),
    BSLV:    new Contract(ADDRESSES.BSLV,  ABI_ERC20, rp),
  }

  const [usdcRaw, ethRaw, solRaw, bslvRaw] = await Promise.all([
    contracts.USDC.balanceOf(account),
    contracts.ETH_TKN.balanceOf(account),
    contracts.SOL_TKN.balanceOf(account),
    contracts.BSLV.balanceOf(account),
  ])

  return {
    USDC:    Number(formatUnits(usdcRaw,  USDC_DECIMALS)),
    ETH_TKN: Number(formatUnits(ethRaw,   18)),
    SOL_TKN: Number(formatUnits(solRaw,   18)),
    BSLV:    Number(formatUnits(bslvRaw,  18)),
  }
}

// ── loadPos ───────────────────────────────────────────────────────────────
// Returns all open perpetual positions for the connected account.
//
// Each position object:
//   { posId, sym, isLong, lev, col, size, entry, liqPrice, pnl, pnlPct }
//
// Positions with zero collateral (p[4] === 0n) are skipped — they are closed.
// Falls back to a synthetic liquidation price if the contract call fails.
//
// Mirrors legacy async function loadPos().

export async function loadPos() {
  const account = getAccount()
  if (!account) return []

  const rp = getReadProvider()
  if (!rp) return []

  const rc = new Contract(ADDRESSES.PERP, ABI_PERP, rp)

  let posIds
  try {
    posIds = await rc.userPositions(account)
  } catch (_e) {
    return []
  }

  if (!posIds.length) return []

  const positions = await Promise.all(
    posIds.map(async (id) => {
      try {
        const p = await rc.getPosition(id)

        // p layout: [owner, assetKey, isLong, lev, collateral, size, entryPrice, openTime]
        if (p[4] === 0n) return null   // closed position

        const sym    = KEY_TO_SYM[p[1]] ?? p[1]
        const col    = Number(formatUnits(p[4], USDC_DECIMALS))
        const size   = Number(formatUnits(p[5], USDC_DECIMALS))
        const entry  = Number(formatUnits(p[6], 18))
        const isLong = Boolean(p[2])
        const lev    = Number(p[3])

        // Unrealised PnL
        let pnl    = 0
        let pnlPct = 0
        try {
          const [pnlRaw] = await rc.unrealisedPnL(id)
          pnl    = Number(formatUnits(pnlRaw, USDC_DECIMALS))
          pnlPct = col > 0 ? (pnl / col) * 100 : 0
        } catch (_e) {
          // leave 0
        }

        // Liquidation price
        let liqPrice = null
        try {
          const liqRaw = await rc.liquidationPrice(id)
          liqPrice     = Number(formatUnits(liqRaw, 18))
        } catch (_e) {
          // synthetic fallback: ±(entry ± entry/lev * 0.9)
          if (isLong) {
            liqPrice = entry - (entry / lev) * 0.9
          } else {
            liqPrice = entry + (entry / lev) * 0.9
          }
        }

        return { posId: id.toString(), sym, isLong, lev, col, size, entry, liqPrice, pnl, pnlPct }
      } catch (_e) {
        return null
      }
    }),
  )

  return positions.filter(Boolean)
}

// ── loadPts ───────────────────────────────────────────────────────────────
// Returns points / referral data for the connected account:
//   { pts, vol, streak, refCount, code, referrer }
//
// Mirrors legacy async function loadPts().

export async function loadPts() {
  const account = getAccount()
  if (!account) return null

  const rp = getReadProvider()
  if (!rp) return null

  try {
    const rc   = new Contract(ADDRESSES.PTS, ABI_PTS, rp)
    const info = await rc.getUserInfo(account)

    // info layout: [pts, vol, streak, refCount, codeBytes32, referrerAddr]
    const code = decodeBytes32String(info[4]).replace(/\0/g, '')

    return {
      pts:      Number(info[0]),
      vol:      Number(formatUnits(info[1], USDC_DECIMALS)),
      streak:   Number(info[2]),
      refCount: Number(info[3]),
      code,
      referrer: info[5],
    }
  } catch (_e) {
    return null
  }
}

// ── regPts ────────────────────────────────────────────────────────────────
// Registers a referral code for the connected account.
//
// `myCode`  — the user's chosen referral code (string)
// `refCode` — a referrer's code to credit (string, may be empty)
//
// NOTE: the legacy app called `cPts()` (lowercase 't') which was a bug —
// the correct export from wallet.js is `cPTS()`. Using `cPTS()` here.
//
// Mirrors legacy async function regPts(myCode, refCode).

export async function regPts(myCode, refCode) {
  const myBytes  = encodeBytes32String(myCode.trim())
  const refBytes = refCode?.trim() ? encodeBytes32String(refCode.trim()) : ZeroHash

  const tx = await cPTS().register(myBytes, refBytes)
  return waitTx(tx)
}

// ── claimFaucet ───────────────────────────────────────────────────────────
// Claims testnet tokens from the faucet.
//
// Pre-flight checks (throws with descriptive messages on failure):
//   - canClaim()            — false → 'Not eligible; cooldown: Xs'
//   - getBalance()          — 0n    → 'Faucet empty'
//
// Mirrors legacy async function claimFaucet().

export async function claimFaucet() {
  const rp = getReadProvider()
  const account = getAccount()
  if (!account) throw new Error('Wallet not connected')

  if (rp) {
    const rc = new Contract(ADDRESSES.FAUCET, ABI_FAUCET, rp)

    const can = await rc.canClaim(account).catch(() => true)
    if (!can) {
      const cd  = await rc.cooldownRemaining(account).catch(() => 0n)
      const sec = Number(cd)
      throw new Error(`Not eligible yet. Cooldown: ${sec}s remaining.`)
    }

    const bal = await rc.getBalance().catch(() => 1n)
    if (bal === 0n) throw new Error('Faucet empty. Check back later.')
  }

  const tx      = await cFAU().claim({ gasLimit: 120000 })
  const receipt = await waitTx(tx)
  return receipt
}

// ── getFauCd ──────────────────────────────────────────────────────────────
// Returns the faucet cooldown remaining in seconds (0 if claimable or on error).
//
// Mirrors legacy async function getFauCd().

export async function getFauCd() {
  const account = getAccount()
  if (!account) return 0

  try {
    const rp = getReadProvider()
    if (!rp) return 0

    const rc = new Contract(ADDRESSES.FAUCET, ABI_FAUCET, rp)
    const cd = await rc.cooldownRemaining(account)
    return Number(cd)
  } catch (_e) {
    return 0
  }
}
