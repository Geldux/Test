import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { pythP, pollPyth } from '@/services/web3/oracle'
import { loadBal, loadPos, loadPts } from '@/services/web3/data'
import { sbT, sbLB, sbMS, sbN } from '@/services/api/supabase'
import { useWallet } from './WalletContext'

const DataCtx = createContext(null)

export function DataProvider({ children }) {
  const { account } = useWallet()

  const [prices,        setPrices]        = useState({ ...pythP })
  const [balances,      setBalances]      = useState(null)
  const [positions,     setPositions]     = useState([])
  const [pts,           setPts]           = useState(null)
  const [tradeHistory,  setTradeHistory]  = useState([])
  const [notifications, setNotifications] = useState([])
  const [leaderboard,   setLeaderboard]   = useState([])
  const [myLBRow,       setMyLBRow]       = useState(null)

  // Price poll — every 10 s, no wallet required
  useEffect(() => {
    let alive = true
    const tick = async () => {
      await pollPyth().catch(() => {})
      if (alive) setPrices({ ...pythP })
    }
    tick()
    const id = setInterval(tick, 10_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // Account-scoped data: load on connect, refresh every 30 s
  const loadAccountData = useCallback(async () => {
    if (!account) {
      setBalances(null)
      setPositions([])
      setPts(null)
      setTradeHistory([])
      setNotifications([])
      setLeaderboard([])
      setMyLBRow(null)
      return
    }
    const [bals, pos, ptsR, trades, notifs, lb, myRow] = await Promise.allSettled([
      loadBal(),
      loadPos(),
      loadPts(),
      sbT(),
      sbN(),
      sbLB(),
      sbMS(),
    ])
    if (bals.status   === 'fulfilled') setBalances(bals.value)
    if (pos.status    === 'fulfilled') setPositions(pos.value)
    if (ptsR.status   === 'fulfilled') setPts(ptsR.value)
    if (trades.status === 'fulfilled') setTradeHistory(trades.value)
    if (notifs.status === 'fulfilled') setNotifications(notifs.value)
    if (lb.status     === 'fulfilled') setLeaderboard(lb.value)
    if (myRow.status  === 'fulfilled') setMyLBRow(myRow.value)
  }, [account])

  useEffect(() => {
    loadAccountData()
    if (!account) return
    const id = setInterval(loadAccountData, 30_000)
    return () => clearInterval(id)
  }, [account, loadAccountData])

  return (
    <DataCtx.Provider value={{
      prices,
      balances,
      positions,
      pts,
      tradeHistory,
      notifications,
      leaderboard,
      myLBRow,
      refresh: loadAccountData,
    }}>
      {children}
    </DataCtx.Provider>
  )
}

export const useAppData = () => useContext(DataCtx)
