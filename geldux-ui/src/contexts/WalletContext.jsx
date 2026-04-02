import { createContext, useContext, useState, useCallback } from 'react'
import { connectWallet, getAccount } from '@/services/web3/wallet'
import { useToast } from './ToastContext'

const WalletCtx = createContext(null)

export function WalletProvider({ children }) {
  const [account,      setAccount]    = useState(() => getAccount())
  const [isConnecting, setConnecting] = useState(false)
  const { showToast }                 = useToast()

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const acc = await connectWallet()
      setAccount(acc)
      showToast('Wallet connected: ' + acc.slice(0, 6) + '…' + acc.slice(-4), 'success')
    } catch (e) {
      const msg = e?.message || 'Connection failed'
      showToast(
        msg.includes('No wallet')         ? 'No wallet found. Open in MetaMask browser.' :
        msg.includes('Switch to Base')    ? 'Please switch to Base Sepolia in MetaMask.' :
        msg.includes('No accounts')       ? 'No accounts returned. Unlock MetaMask.' :
        msg,
        'error',
      )
    } finally {
      setConnecting(false)
    }
  }, [showToast])

  return (
    <WalletCtx.Provider value={{ account, isConnecting, connect }}>
      {children}
    </WalletCtx.Provider>
  )
}

export const useWallet = () => useContext(WalletCtx)
