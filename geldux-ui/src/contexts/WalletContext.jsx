import { createContext, useContext, useState, useCallback } from 'react'
import { connectWallet, getAccount } from '@/services/web3/wallet'

const WalletCtx = createContext(null)

export function WalletProvider({ children }) {
  const [account,      setAccount]   = useState(() => getAccount())
  const [isConnecting, setConnecting] = useState(false)
  const [connectError, setError]      = useState(null)

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      const acc = await connectWallet()
      setAccount(acc)
    } catch (e) {
      setError(e.message)
    } finally {
      setConnecting(false)
    }
  }, [])

  return (
    <WalletCtx.Provider value={{ account, isConnecting, connectError, connect }}>
      {children}
    </WalletCtx.Provider>
  )
}

export const useWallet = () => useContext(WalletCtx)
