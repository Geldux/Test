import { supabase, HAS_SUPABASE } from '@/lib/supabase'
export { HAS_SUPABASE }
import { EXPLORER } from '@/config/chain'

export const BASESCAN_TX = `${EXPLORER}/tx/`
const NETWORK = 'base-sepolia'

/* Normalize a UI entry object to a Supabase row */
export function entryToRow(entry, wallet) {
  return {
    wallet:       wallet.toLowerCase(),
    type:         entry.type,
    tx_hash:      entry.hash,
    block_number: entry.blockNumber,
    ts:           entry.ts,
    sym:          entry.sym   ?? '',
    is_long:      entry.isLong   ?? null,
    pos_id:       entry.posId    ?? null,
    leverage:     entry.leverage ?? null,
    collateral:   entry.collateral ?? null,
    size:         entry.size   ?? null,
    pnl:          entry.pnl    ?? null,
    amount:       entry.amount ?? null,
    label:        entry.label  ?? null,
    order_id:     entry.orderId ?? null,
    network:      NETWORK,
  }
}

/* Convert a Supabase row back to the UI entry shape */
export function rowToEntry(row) {
  return {
    type:        row.type,
    hash:        row.tx_hash,
    blockNumber: Number(row.block_number),
    ts:          Number(row.ts),
    sym:         row.sym     ?? '',
    isLong:      row.is_long ?? null,
    posId:       row.pos_id  ?? null,
    leverage:    row.leverage   != null ? Number(row.leverage)   : null,
    collateral:  row.collateral != null ? Number(row.collateral) : null,
    size:        row.size  != null ? Number(row.size)  : null,
    pnl:         row.pnl   != null ? Number(row.pnl)   : null,
    amount:      row.amount != null ? Number(row.amount) : null,
    label:       row.label   ?? null,
    orderId:     row.order_id ?? null,
  }
}

/* Derive summary stats from a normalized entry array */
export function buildSummaryFromEntries(entries) {
  let tradeCount = 0, closedCount = 0, realizedPnl = 0
  let totalDeposits = 0, totalWithdrawals = 0, totalVolume = 0
  for (const e of entries) {
    if (e.type === 'open' || e.type === 'cross_open') tradeCount++
    if (e.type === 'close')       { closedCount++; realizedPnl += e.pnl ?? 0 }
    if (e.type === 'cross_close')   closedCount++
    if (e.type === 'deposit')       totalDeposits    += e.amount ?? 0
    if (e.type === 'withdraw')      totalWithdrawals += e.amount ?? 0
    if (e.type === 'open' && e.size != null) totalVolume += e.size
  }
  return { tradeCount, closedCount, realizedPnl, totalDeposits, totalWithdrawals, totalVolume }
}

/**
 * Read cached history from Supabase for a wallet.
 * Returns { entries, latestBlock } or null when not configured / on error.
 */
export async function readFromSupabase(wallet) {
  if (!HAS_SUPABASE) return null
  try {
    const { data, error } = await supabase
      .from('geldux_history')
      .select('*')
      .eq('wallet', wallet.toLowerCase())
      .eq('network', NETWORK)
      .order('block_number', { ascending: false })
      .limit(500)
    if (error) {
      console.warn('[historyService] Supabase read error:', error.message)
      return null
    }
    const entries     = (data ?? []).map(rowToEntry)
    const latestBlock = entries.length > 0 ? entries[0].blockNumber : 0
    return { entries, latestBlock }
  } catch (e) {
    console.warn('[historyService] Supabase read failed:', e?.message ?? e)
    return null
  }
}

/**
 * Upsert new on-chain entries to Supabase.
 * Fire-and-forget — silently handles failures.
 */
export async function writeToSupabase(entries, wallet) {
  if (!HAS_SUPABASE || !entries.length) return
  try {
    const rows = entries.map((e) => entryToRow(e, wallet))
    const { error } = await supabase
      .from('geldux_history')
      .upsert(rows, { onConflict: 'tx_hash,type,wallet', ignoreDuplicates: true })
    if (error) {
      console.error('[historyService] Supabase write error:', error.message, error)
    } else {
      console.log(`[historyService] wrote ${rows.length} row(s) to Supabase for ${wallet.slice(0, 8)}…`)
    }
  } catch (e) {
    console.error('[historyService] Supabase write failed:', e?.message ?? e)
  }
}
