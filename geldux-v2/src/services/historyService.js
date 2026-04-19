import { supabase, HAS_SUPABASE } from '@/lib/supabase'
export { HAS_SUPABASE }
import { EXPLORER } from '@/config/chain'

export const BASESCAN_TX = `${EXPLORER}/tx/`
const NETWORK = 'base-sepolia'

/* ── Row normalisation ──────────────────────────────────────────────── */

export function entryToRow(entry, wallet) {
  return {
    wallet:       wallet.toLowerCase(),
    type:         entry.type,
    tx_hash:      entry.hash,
    block_number: entry.blockNumber ?? 0,
    ts:           entry.ts ?? Math.floor(Date.now() / 1000),
    sym:          entry.sym        ?? '',
    is_long:      entry.isLong     ?? null,
    pos_id:       entry.posId      ?? null,
    leverage:     entry.leverage   ?? null,
    collateral:   entry.collateral ?? null,
    size:         entry.size       ?? null,
    pnl:          entry.pnl        ?? null,
    amount:       entry.amount     ?? null,
    label:        entry.label      ?? null,
    order_id:     entry.orderId    ?? null,
    network:      NETWORK,
    status:       entry.status     ?? 'confirmed',
    mode:         entry.mode       ?? null,
    entry_price:  entry.entryPrice ?? null,
  }
}

export function rowToEntry(row) {
  return {
    type:        row.type,
    hash:        row.tx_hash,
    blockNumber: Number(row.block_number),
    ts:          Number(row.ts),
    sym:         row.sym        ?? '',
    isLong:      row.is_long    ?? null,
    posId:       row.pos_id     ?? null,
    leverage:    row.leverage   != null ? Number(row.leverage)   : null,
    collateral:  row.collateral != null ? Number(row.collateral) : null,
    size:        row.size       != null ? Number(row.size)       : null,
    pnl:         row.pnl        != null ? Number(row.pnl)        : null,
    amount:      row.amount     != null ? Number(row.amount)     : null,
    label:       row.label      ?? null,
    orderId:     row.order_id   ?? null,
    status:      row.status     ?? 'confirmed',
    mode:        row.mode       ?? null,
    entryPrice:  row.entry_price != null ? Number(row.entry_price) : null,
  }
}

/* ── Summary ────────────────────────────────────────────────────────── */

export function buildSummaryFromEntries(entries) {
  let tradeCount = 0, closedCount = 0, realizedPnl = 0
  let totalDeposits = 0, totalWithdrawals = 0, totalVolume = 0
  for (const e of entries) {
    if (e.status === 'failed' || e.status === 'cancelled') continue
    if (e.type === 'open' || e.type === 'cross_open') tradeCount++
    if (e.type === 'close')       { closedCount++; realizedPnl += e.pnl ?? 0 }
    if (e.type === 'cross_close')   closedCount++
    if (e.type === 'deposit')       totalDeposits    += e.amount ?? 0
    if (e.type === 'withdraw')      totalWithdrawals += e.amount ?? 0
    if (e.type === 'open' && e.size != null) totalVolume += e.size
  }
  return { tradeCount, closedCount, realizedPnl, totalDeposits, totalWithdrawals, totalVolume }
}

/* ── Supabase reads ─────────────────────────────────────────────────── */

export async function readFromSupabase(wallet) {
  if (!HAS_SUPABASE) return null
  try {
    const { data, error } = await supabase
      .from('geldux_history')
      .select('*')
      .eq('wallet', wallet.toLowerCase())
      .eq('network', NETWORK)
      .order('ts', { ascending: false })
      .limit(500)
    if (error) {
      console.warn('[historyService] Supabase read error:', error.message)
      return null
    }
    const entries = (data ?? []).map(rowToEntry)
    /* latestBlock from confirmed entries only — pending have block_number=0 */
    const latestBlock = (data ?? [])
      .filter((r) => Number(r.block_number) > 0)
      .reduce((max, r) => Math.max(max, Number(r.block_number)), 0)
    return { entries, latestBlock }
  } catch (e) {
    console.warn('[historyService] Supabase read failed:', e?.message ?? e)
    return null
  }
}

/* ── Supabase writes ────────────────────────────────────────────────── */

/**
 * Write a confirmed tx immediately after receipt — no waiting for the slow scan.
 * Upserts so duplicate writes (e.g. scan + fast path) are idempotent.
 */
export async function writeConfirmedTxToSupabase(entry, wallet) {
  if (!HAS_SUPABASE) return
  try {
    const row = entryToRow({ ...entry, status: 'confirmed' }, wallet)
    const { error } = await supabase
      .from('geldux_history')
      .upsert([row], { onConflict: 'tx_hash,type,wallet' })
    if (error) console.error('[historyService] confirmed write error:', error.message, error)
    else console.log(`[historyService] confirmed ${entry.type} ${entry.hash?.slice(0, 8)}… written for ${wallet.slice(0, 8)}…`)
  } catch (e) {
    console.error('[historyService] confirmed write failed:', e?.message ?? e)
  }
}

/**
 * Write a pending record immediately on tx submission.
 * Upserts so a re-submission of the same hash is idempotent.
 */
export async function writePendingToSupabase(entry, wallet) {
  if (!HAS_SUPABASE) return
  try {
    const row = {
      ...entryToRow(entry, wallet),
      block_number: 0,
      ts:           Math.floor(Date.now() / 1000),
      status:       'pending',
    }
    const { error } = await supabase
      .from('geldux_history')
      .upsert([row], { onConflict: 'tx_hash,type,wallet' })
    if (error) console.error('[historyService] pending write error:', error.message, error)
  } catch (e) {
    console.error('[historyService] pending write failed:', e?.message ?? e)
  }
}

/**
 * Upsert confirmed on-chain entries.
 * Full update on conflict so confirmed data promotes any pending record
 * with the same tx_hash+type+wallet to status='confirmed'.
 * Requires an UPDATE RLS policy on the table.
 */
export async function writeToSupabase(entries, wallet) {
  if (!HAS_SUPABASE || !entries.length) return
  try {
    const rows = entries.map((e) =>
      entryToRow({ ...e, status: e.status ?? 'confirmed' }, wallet)
    )
    const { error } = await supabase
      .from('geldux_history')
      .upsert(rows, { onConflict: 'tx_hash,type,wallet' })
    if (error) {
      console.error('[historyService] Supabase write error:', error.message, error)
    } else {
      console.log(`[historyService] wrote ${rows.length} row(s) for ${wallet.slice(0, 8)}…`)
    }
  } catch (e) {
    console.error('[historyService] Supabase write failed:', e?.message ?? e)
  }
}
