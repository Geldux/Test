import { useState, useCallback, useEffect } from 'react'
import { BrowserProvider, JsonRpcProvider } from 'ethers'
import { CHAIN_ID, CHAIN_HEX, BASE_CHAIN_PARAMS, RPC_LIST } from '@/config/chain'

let _provider = null
let _signer   = null
let _account  = null
let _readProv = null

export function getProvider()     { return _provider }
export function getSigner()       { return _signer }
export function getAccount()      { return _account }
function _isValidRpcUrl(u) {
  if (!u) return false
  if (u.endsWith('/undefined') || u.endsWith('/null')) return false
  /* Catch double-URL: env var was a full URL pasted into a field expecting only the key */
  if (/\/https?:\/\//.test(u)) return false
  return true
}

export function getReadProvider() {
  if (_readProv) return _readProv
  const tryList = RPC_LIST.filter(_isValidRpcUrl)
  if (!tryList.length) {
    console.error('[getReadProvider] no valid RPC URLs — check VITE_ALCHEMY_API_KEY in env')
    return null
  }
  for (const url of tryList) {
    try {
      _readProv = new JsonRpcProvider(url)
      /* Log once on first creation — mask key portion for security */
      console.log('[getReadProvider] using:', url.replace(/\/v2\/[^/]+$/, '/v2/***').replace(/\/v2$/, '/v2/***'))
      return _readProv
    } catch (_) {}
  }
  console.error('[getReadProvider] FAILED — could not construct provider from:', tryList.map((u) => u.slice(0, 40) + '…'))
  return null
}

async function ensureNetwork(provider) {
  const net = await provider.getNetwork()
  if (Number(net.chainId) === CHAIN_ID) return
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] })
  } catch (err) {
    if (err.code === 4902 || err.code === -32603) {
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [BASE_CHAIN_PARAMS] })
    } else throw err
  }
  await new Promise((r) => setTimeout(r, 400))
  const prov2 = new BrowserProvider(window.ethereum)
  const net2  = await prov2.getNetwork()
  if (Number(net2.chainId) !== CHAIN_ID) throw new Error('Please switch to Base Sepolia.')
}

export function useWallet() {
  const [account,      setAccount]      = useState(null)
  const [isConnecting, setConnecting]   = useState(false)
  const [chainOk,      setChainOk]      = useState(false)
  const [error,        setError]        = useState(null)

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError('No wallet found. Open in MetaMask browser.')
      return
    }
    setConnecting(true)
    setError(null)
    try {
      const accs = await window.ethereum.request({ method: 'eth_requestAccounts' })
      if (!accs?.length) throw new Error('No accounts returned.')
      _provider = new BrowserProvider(window.ethereum)
      await ensureNetwork(_provider)
      _provider = new BrowserProvider(window.ethereum)
      _signer   = await _provider.getSigner()
      _account  = (await _signer.getAddress()).toLowerCase()
      setAccount(_account)
      setChainOk(true)
      window.ethereum.removeAllListeners?.()
      window.ethereum.on('accountsChanged', () => window.location.reload())
      window.ethereum.on('chainChanged',    () => window.location.reload())
    } catch (e) {
      const msg = e?.message || 'Connection failed'
      setError(
        msg.includes('No wallet')       ? 'No wallet found. Open in MetaMask browser.' :
        msg.includes('Base Sepolia')    ? 'Please switch to Base Sepolia in MetaMask.' :
        msg.includes('User rejected')   ? 'Connection rejected.' :
        msg
      )
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    _provider = null; _signer = null; _account = null
    setAccount(null); setChainOk(false)
  }, [])

  /* Auto-detect if already connected */
  useEffect(() => {
    if (!window.ethereum) return
    window.ethereum.request({ method: 'eth_accounts' }).then((accs) => {
      if (accs?.length) connect()
    }).catch(() => {})
  }, [connect])

  return { account, isConnecting, chainOk, error, connect, disconnect }
}
