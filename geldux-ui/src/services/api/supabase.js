/**
 * supabase.js
 *
 * Supabase client and all database helper functions.
 *
 * Extracted from legacy/index.html — behaviour preserved exactly.
 * URL and anon key read from Vite env vars; no hardcoded credentials.
 *
 * Public API
 *   SB       — Supabase client (or offline stub)
 *   sbN()    — fetch notifications for connected account
 *   sbAN()   — add a notification
 *   sbMR()   — mark notification(s) read
 *   sbT()    — fetch trade history
 *   sbST()   — save a trade + update leaderboard
 *   sbMS()   — fetch the connected account's leaderboard row
 *   sbLB()   — fetch full leaderboard (top 50)
 *   sbCI()   — daily check-in (streak + bonus points)
 *   sbSU()   — upsert username / referral code
 */

import { createClient } from '@supabase/supabase-js'
import { getAccount } from '../web3/wallet.js'

// ── Client init ───────────────────────────────────────────────────────────
// Mirrors legacy lines 72-82.
// Falls back to an offline stub when env vars are absent, preserving the
// exact same silent-fail behaviour as the legacy CDN-missing path.

var SB = (function () {
  var u = import.meta.env.VITE_SUPABASE_URL
  var k = import.meta.env.VITE_SUPABASE_ANON_KEY
  try {
    if (u && k) return createClient(u, k)
  } catch (e) {}

  /* Offline stub — mirrors legacy fallback exactly */
  var q = function () { return Promise.resolve({ data: null, error: 'offline' }) }
  var chain = {
    select: function () { return chain },
    insert: q,
    upsert: q,
    update: function () { return { eq: function () { return q() } } },
    eq: function () { return chain },
    order: function () { return chain },
    limit: function () { return chain },
    maybeSingle: q
  }
  console.warn('Supabase offline')
  return {
    from: function () { return chain },
    channel: function () {
      return { on: function () { return this }, subscribe: function () { return { unsubscribe: function () {} } } }
    }
  }
})()

export { SB }

// ── Private helpers ───────────────────────────────────────────────────────
// Mirrors legacy `var addrLC = function(){return account?account.toLowerCase():''};`

var addrLC = function () { return getAccount() ? getAccount().toLowerCase() : '' }

// ── sbN — fetch notifications ─────────────────────────────────────────────
// Mirrors legacy var sbN.

export var sbN = async function () {
  if (!getAccount()) return []
  try {
    var r = await SB.from('notifications').select('*').eq('address', addrLC()).order('created_at', { ascending: false }).limit(50)
    return r.data || []
  } catch (er) { return [] }
}

// ── sbAN — add notification ───────────────────────────────────────────────
// Mirrors legacy var sbAN.

export var sbAN = async function (title, body, txh) {
  if (!getAccount()) return
  try {
    await SB.from('notifications').insert({ address: addrLC(), icon: 'trade', title: title, body: body, tx_hash: txh || '' })
  } catch (er) { console.warn('sbAN', er.message) }
}

// ── sbMR — mark notifications read ───────────────────────────────────────
// Mirrors legacy var sbMR.

export var sbMR = async function (id, all) {
  try {
    var q = SB.from('notifications').update({ is_read: true })
    if (all) await q.eq('address', addrLC())
    else await q.eq('id', id)
  } catch (er) {}
}

// ── sbT — fetch trade history ─────────────────────────────────────────────
// Mirrors legacy var sbT.

export var sbT = async function () {
  if (!getAccount()) return []
  try {
    var r = await SB.from('trades').select('*').eq('address', addrLC()).order('created_at', { ascending: false }).limit(50)
    return r.data || []
  } catch (er) { return [] }
}

// ── sbST — save trade + update leaderboard ────────────────────────────────
// Mirrors legacy var sbST.

export var sbST = async function (type, asset, side, amtUsd, priceUsd, pnl, txh) {
  if (!getAccount()) return
  try {
    await SB.from('trades').insert({ address: addrLC(), tx_hash: txh || '', type: type, asset: asset, side: side, amount_usd: parseFloat(amtUsd) || 0, price_usd: parseFloat(priceUsd) || 0, pnl_usd: parseFloat(pnl) || 0 })
  } catch (er) {
    console.warn('sbST trades:', er.message)
    setTimeout(async function () {
      try { await SB.from('trades').insert({ address: addrLC(), tx_hash: txh || '', type: type, asset: asset, side: side, amount_usd: parseFloat(amtUsd) || 0, price_usd: parseFloat(priceUsd) || 0, pnl_usd: parseFloat(pnl) || 0 }) } catch (e2) { console.warn('sbST retry:', e2.message) }
    }, 3000)
  }
  try {
    var ex = await SB.from('leaderboard').select('volume_usd,pnl_usd,points').eq('address', addrLC()).maybeSingle()
    var d = (ex && ex.data) || {}
    await SB.from('leaderboard').upsert({ address: addrLC(), volume_usd: (Number(d.volume_usd) || 0) + amtUsd, pnl_usd: (Number(d.pnl_usd) || 0) + (pnl || 0), points: (Number(d.points) || 0) + Math.max(1, Math.floor(amtUsd / 10)), last_trade: new Date().toISOString() }, { onConflict: 'address' })
  } catch (er) { console.warn('sbST lb', er.message) }
}

// ── sbMS — fetch own leaderboard row ─────────────────────────────────────
// Mirrors legacy var sbMS.

export var sbMS = async function () {
  if (!getAccount()) return null
  try {
    var r = await SB.from('leaderboard').select('*').eq('address', addrLC()).maybeSingle()
    return (r && r.data) || null
  } catch (er) { return null }
}

// ── sbLB — fetch full leaderboard ────────────────────────────────────────
// Mirrors legacy var sbLB.

export var sbLB = async function () {
  try {
    var r = await SB.from('leaderboard').select('address,username,points,volume_usd,pnl_usd,streak').order('volume_usd', { ascending: false }).limit(50)
    return (r.data || []).map(function (row) {
      return { address: row.address, username: row.username || '', pts: Math.round(Number(row.points) || 0), vol: Math.round((Number(row.volume_usd) || 0) * 100) / 100, pnl: Math.round((Number(row.pnl_usd) || 0) * 100) / 100, streak: Number(row.streak) || 0 }
    })
  } catch (er) { return [] }
}

// ── sbCI — daily check-in ─────────────────────────────────────────────────
// Mirrors legacy var sbCI.

export var sbCI = async function () {
  if (!getAccount()) throw new Error('Not connected')
  try {
    var ex = await SB.from('leaderboard').select('streak,last_trade,points').eq('address', addrLC()).maybeSingle()
    var d = (ex && ex.data) || {}
    var now = new Date(), tod = now.toISOString().slice(0, 10)
    var last = d.last_trade ? new Date(d.last_trade).toISOString().slice(0, 10) : null
    if (last === tod) throw new Error('Already checked in today!')
    var yest = new Date(now); yest.setUTCDate(yest.getUTCDate() - 1)
    var ns = last === yest.toISOString().slice(0, 10) ? (Number(d.streak) || 0) + 1 : 1
    var bonus = ns >= 30 ? 2000 : ns >= 14 ? 1000 : ns >= 7 ? 500 : ns >= 3 ? 150 : 50
    await SB.from('leaderboard').upsert({ address: addrLC(), streak: ns, last_trade: now.toISOString(), points: (Number(d.points) || 0) + bonus }, { onConflict: 'address' })
    return { streak: ns, bonus: bonus }
  } catch (er) { throw er }
}

// ── sbSU — upsert username / referral code ────────────────────────────────
// Mirrors legacy var sbSU.

export var sbSU = async function (uname, refCode) {
  if (!getAccount()) return
  try {
    await SB.from('users').upsert({ address: addrLC(), username: uname, ref_code: refCode || '' }, { onConflict: 'address' })
    await SB.from('leaderboard').upsert({ address: addrLC(), username: uname }, { onConflict: 'address' })
  } catch (er) {
    try {
      await SB.from('users').upsert({ address: addrLC(), username: uname }, { onConflict: 'address' })
      await SB.from('leaderboard').upsert({ address: addrLC(), username: uname }, { onConflict: 'address' })
    } catch (e2) {}
  }
}
