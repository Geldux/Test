/**
 * data.js
 *
 * Account data loading: balances, positions, points, faucet.
 *
 * Extracted from legacy/index.html — behaviour preserved exactly.
 * No UI wiring.
 *
 * Public API
 *   loadBal()                   fetch token balances for the connected account
 *   loadPos()                   fetch open perpetual positions
 *   loadPts()                   fetch points / referral info
 *   regPts(myCode, refCode)     register a referral code
 *   claimFaucet()               claim testnet faucet tokens
 *   getFauCd()                  get faucet cooldown seconds remaining
 */

import {
  formatUnits,
  formatEther,
  encodeBytes32String,
  decodeBytes32String,
  ZeroHash,
} from 'ethers'
import { ADDRESSES, MARKET_KEYS, USDC_DECIMALS, ALCHEMY_RPC } from './config.js'
import { getAccount, cUSDC, cPERP, cPTS, cFAU, cTKN } from './wallet.js'
import { waitTx } from './tx.js'

// ── alchemyGetTokenBalances (private) ─────────────────────────────────────
// Mirrors legacy async function alchemyGetTokenBalances(addr).

async function alchemyGetTokenBalances(addr) {
  if (!addr) return null
  try {
    var body = {
      id: 1, jsonrpc: '2.0', method: 'alchemy_getTokenBalances',
      params: [addr, [ADDRESSES.USDC, ADDRESSES.ETHT, ADDRESSES.SOLT, ADDRESSES.BSLV]]
    }
    var r = await fetch(ALCHEMY_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000)
    })
    if (!r.ok) return null
    var d = await r.json()
    if (!d.result || !d.result.tokenBalances) return null
    var out = { USDC: 0, ETH_TKN: 0, SOL_TKN: 0, BSLV: 0 }
    d.result.tokenBalances.forEach(function (tb) {
      var hex = tb.tokenBalance
      if (!hex || hex === '0x') return
      var val = Number(BigInt(hex))
      if (tb.contractAddress.toLowerCase() === ADDRESSES.USDC.toLowerCase())
        out.USDC = val / 1e18  /* 18 decimals */
      else if (tb.contractAddress.toLowerCase() === ADDRESSES.ETHT.toLowerCase())
        out.ETH_TKN = val / 1e18
      else if (tb.contractAddress.toLowerCase() === ADDRESSES.SOLT.toLowerCase())
        out.SOL_TKN = val / 1e18
      else if (tb.contractAddress.toLowerCase() === ADDRESSES.BSLV.toLowerCase())
        out.BSLV = val / 1e18
    })
    return out
  } catch (e) {
    console.warn('[AlchemyToken]', e.message)
    return null /* caller falls back to contract reads */
  }
}

// ── loadBal ───────────────────────────────────────────────────────────────
// Mirrors legacy async function loadBal().

export async function loadBal() {
  var account = getAccount()
  if (!account) return { USDC: 0, ETH_TKN: 0, SOL_TKN: 0, BSLV: 0 }

  /* Try Alchemy Token API first (faster, single call) */
  try {
    var alchBal = await alchemyGetTokenBalances(account)
    if (alchBal) return alchBal
  } catch (e) {}

  /* Fallback: direct contract reads */
  try {
    var r = await Promise.all([
      cUSDC().balanceOf(account),
      cTKN(ADDRESSES.ETHT).balanceOf(account),
      cTKN(ADDRESSES.SOLT).balanceOf(account),
      cTKN(ADDRESSES.BSLV).balanceOf(account)
    ])
    return {
      USDC:    Number(formatUnits(r[0], USDC_DECIMALS)),
      ETH_TKN: Number(formatEther(r[1])),
      SOL_TKN: Number(formatEther(r[2])),
      BSLV:    Number(formatEther(r[3]))
    }
  } catch (er) { return { USDC: 0, ETH_TKN: 0, SOL_TKN: 0, BSLV: 0 } }
}

// ── claimFaucet ───────────────────────────────────────────────────────────
// Mirrors legacy async function claimFaucet().

export async function claimFaucet() {
  var account = getAccount()
  var fc = cFAU()
  if (!fc) throw new Error('Faucet error')
  var canC = await fc.canClaim(account).catch(function () { return true })
  if (!canC) {
    var rem = await fc.cooldownRemaining(account).catch(function () { return BigInt(0) })
    var hh = Math.floor(Number(rem) / 3600), mm = Math.ceil((Number(rem) % 3600) / 60)
    throw new Error('Cooldown: ' + hh + 'h ' + mm + 'm remaining. Come back later!')
  }
  try {
    var fauBal = await fc.getBalance()
    if (fauBal === BigInt(0)) throw new Error('Faucet empty. Fund it: ' + ADDRESSES.FAUCET)
  } catch (be) { if (be.message.indexOf('Faucet empty') >= 0 || be.message.indexOf('Fund it') >= 0) throw be }
  var tx = await fc.claim({ gasLimit: 120000 })
  await waitTx(tx)
  return tx.hash
}

// ── getFauCd ──────────────────────────────────────────────────────────────
// Mirrors legacy async function getFauCd().

export async function getFauCd() {
  var account = getAccount()
  try { return Number(await cFAU().cooldownRemaining(account)) } catch { return 0 }
}

// ── loadPos ───────────────────────────────────────────────────────────────
// Mirrors legacy async function loadPos().

export async function loadPos() {
  var account = getAccount()
  if (!account || !cPERP()) return []
  try {
    var ids = await cPERP().userPositions(account)
    var list = await Promise.all(ids.map(async function (id) {
      try {
        var p = await cPERP().getPosition(id)
        if (!p || p[4] === BigInt(0)) return null
        var sym = Object.keys(MARKET_KEYS).find(function (k) { return MARKET_KEYS[k] === p[1] }) || '???'
        /* entryPrice is stored in WAD (1e18 per $1) - must use formatUnits(18) */
        var entry = parseFloat(formatUnits(p[6], 18))
        var colUSD = Number(formatUnits(p[4], USDC_DECIMALS))
        var sizeUSD = Number(formatUnits(p[5], USDC_DECIMALS))
        if (sizeUSD === 0) sizeUSD = colUSD * Number(p[3])
        var liqPrice = 0
        try {
          var liqRaw = await cPERP().liquidationPrice(id)
          /* liqPrice also in WAD */
          liqPrice = parseFloat(formatUnits(liqRaw, 18))
        } catch (le) {}
        if (liqPrice === 0 && entry > 0) { var lv = Number(p[3]); liqPrice = p[2] ? entry * (1 - 0.9 / lv) : entry * (1 + 0.9 / lv) }
        return { id: Number(id), isLong: p[2], leverage: Number(p[3]), colUSD: colUSD, sizeUSD: sizeUSD, entry: entry, sym: sym, liqPrice: liqPrice }
      } catch (er) { return null }
    }))
    return list.filter(function (x) { return x && x.colUSD > 0 })
  } catch (er) { return [] }
}

// ── loadPts ───────────────────────────────────────────────────────────────
// Mirrors legacy async function loadPts().

export async function loadPts() {
  var account = getAccount()
  if (!account || !cPTS()) return null
  try {
    var info = await cPTS().getUserInfo(account)
    var code = decodeBytes32String ? decodeBytes32String(info[4]).replace(/\0/g, '') : ''
    return { pts: Number(info[0]), vol: Number(info[1]), streak: Number(info[2]), refCount: Number(info[3]), code: code, referrer: info[5] }
  } catch (er) { return null }
}

// ── regPts ────────────────────────────────────────────────────────────────
// Mirrors legacy async function regPts(myCode, refCode).

export async function regPts(myCode, refCode) {
  var mc = encodeBytes32String(myCode.slice(0, 31))
  var rc = refCode ? encodeBytes32String(refCode.slice(0, 31)) : ZeroHash
  var tx = await cPTS().register(mc, rc)
  await waitTx(tx)
  return tx.hash
}
