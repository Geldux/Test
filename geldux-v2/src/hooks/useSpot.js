import { useState, useEffect, useCallback, useRef } from 'react'
import { Contract, parseUnits } from 'ethers'
import { ADDRESSES, ABI_USDC } from '@/config/contracts'
import { getReadProvider } from './useWallet'
import { fetchSpotMarkets, quoteSpot, buySpot, sellSpot } from '@/services/web3/spot'

/* 0.5% slippage tolerance applied to quoted amountOut */
const SLIPPAGE_BPS = 50n
function applySlippage(out) {
  return (out * (10000n - SLIPPAGE_BPS)) / 10000n
}

export function useSpot(account) {
  const [markets,    setMarkets]    = useState([])
  const [selectedId, setSelectedId] = useState(null)   /* bytes32 string */
  const [side,       setSide]       = useState('buy')   /* 'buy' | 'sell' */
  const [amount,     setAmount]     = useState('')
  /* quote = { amountOut: bigint, fee: bigint, priceUSD: bigint } | null */
  const [quote,      setQuote]      = useState(null)
  const [usdcBal,    setUsdcBal]    = useState(0n)
  const [tokenBal,   setTokenBal]   = useState(0n)
  const [loading,    setLoading]    = useState(false)
  const [quoting,    setQuoting]    = useState(false)
  const [step,       setStep]       = useState('')

  const mountedRef = useRef(true)
  const quoteTimer = useRef(null)

  const market = markets.find((m) => m.id === selectedId) ?? null

  /* ── Load markets once on mount ────────────────────────────────────── */
  useEffect(() => {
    mountedRef.current = true
    fetchSpotMarkets().then((ms) => {
      if (!mountedRef.current) return
      setMarkets(ms)
      setSelectedId((prev) => prev ?? (ms[0]?.id ?? null))
    }).catch((e) => console.warn('[useSpot] loadMarkets:', e?.message))
    return () => { mountedRef.current = false }
  }, [])

  const reloadMarkets = useCallback(async () => {
    try {
      const ms = await fetchSpotMarkets()
      if (mountedRef.current) setMarkets(ms)
    } catch (e) {
      console.warn('[useSpot] reloadMarkets:', e?.message)
    }
  }, [])

  /* ── Clear state when market or side changes ────────────────────────── */
  useEffect(() => {
    setAmount('')
    setQuote(null)
  }, [selectedId, side])

  /* ── Balances ───────────────────────────────────────────────────────── */
  const refreshBalances = useCallback(async () => {
    if (!account) return
    const rp = getReadProvider()
    if (!rp) return
    try {
      const usdc = new Contract(ADDRESSES.USDC, ABI_USDC, rp)
      const bal  = await usdc.balanceOf(account)
      if (mountedRef.current) setUsdcBal(bal)
    } catch (_) {}
    if (!market?.token) return
    try {
      const tok = new Contract(market.token, ABI_USDC, rp)
      const bal = await tok.balanceOf(account)
      if (mountedRef.current) setTokenBal(bal)
    } catch (_) {}
  }, [account, market?.token])

  useEffect(() => { refreshBalances() }, [refreshBalances])

  /* ── Live quote — debounced 400ms ───────────────────────────────────── */
  useEffect(() => {
    clearTimeout(quoteTimer.current)
    const n = parseFloat(amount)
    if (!n || n <= 0 || !market) { setQuote(null); return }
    quoteTimer.current = setTimeout(async () => {
      try {
        setQuoting(true)
        const raw = parseUnits(String(Number(n).toFixed(18)), 18)
        const q   = await quoteSpot(market.id, side === 'buy', raw)
        if (mountedRef.current) setQuote(q)
      } catch (e) {
        console.warn('[useSpot] quote failed:', e?.message)
        if (mountedRef.current) setQuote(null)
      } finally {
        if (mountedRef.current) setQuoting(false)
      }
    }, 400)
    return () => clearTimeout(quoteTimer.current)
  }, [amount, side, market])

  /* ── Execute swap ───────────────────────────────────────────────────── */
  const execute = useCallback(async () => {
    const n = parseFloat(amount)
    if (!n || n <= 0 || !market || !quote) throw new Error('Invalid swap parameters')
    setLoading(true)
    setStep('Swapping…')
    try {
      const amtRaw = parseUnits(String(Number(n).toFixed(18)), 18)
      const minOut = applySlippage(quote.amountOut)
      let hash
      if (side === 'buy') {
        ;({ hash } = await buySpot({ id: market.id, usdcIn: amtRaw, minOut }))
      } else {
        ;({ hash } = await sellSpot({
          id: market.id, tokenIn: amtRaw,
          tokenAddress: market.token, minUsdc: minOut,
        }))
      }
      setAmount('')
      setQuote(null)
      await Promise.allSettled([reloadMarkets(), refreshBalances()])
      return hash
    } finally {
      if (mountedRef.current) { setLoading(false); setStep('') }
    }
  }, [amount, market, quote, side, reloadMarkets, refreshBalances])

  return {
    markets, market, selectedId, setSelectedId,
    side, setSide, amount, setAmount,
    quote, quoting, usdcBal, tokenBal,
    loading, step, execute, refreshBalances,
  }
}
