import { formatUnits } from 'ethers'
import { useSpot } from '@/hooks/useSpot'
import { toast } from '@/components/Toast'
import { fmtPriceRaw } from '@/utils/format'

/* Format a BigInt token amount (18-decimal) for display */
function fmtAmt(raw) {
  if (raw == null) return '—'
  const n = Number(formatUnits(raw, 18))
  if (!isFinite(n)) return '—'
  if (n >= 1_000_000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (n >= 1_000)     return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n >= 1)         return n.toFixed(4)
  if (n >= 0.0001)    return n.toFixed(6)
  return n.toExponential(3)
}

/* Format a balance BigInt for the "Bal:" line */
function fmtBal(raw) {
  if (!raw) return '0'
  return fmtAmt(raw)
}

/* Format the oracle price returned by the contract (uint256, 1e18 scaled) */
function fmtOraclePrice(raw) {
  if (!raw) return '—'
  return fmtPriceRaw(Number(formatUnits(raw, 18)))
}

export function SpotPanel({ account, onConnect, isConnecting }) {
  const {
    markets, market, selectedId, setSelectedId,
    side, setSide, amount, setAmount,
    quote, quoting, usdcBal, tokenBal,
    loading, step, execute,
  } = useSpot(account)

  const payBal  = side === 'buy'  ? usdcBal  : tokenBal
  const paySym  = side === 'buy'  ? 'USDC'   : (market?.symbol ?? 'Token')
  const rcvSym  = side === 'buy'  ? (market?.symbol ?? 'Token') : 'USDC'
  const n       = parseFloat(amount) || 0

  /* Set amount to pct% of current balance */
  function setAmountPct(pct) {
    if (!payBal) return
    const full = Number(formatUnits(payBal, 18))
    const val  = full * pct / 100
    setAmount(val > 0 ? val.toFixed(6) : '')
  }

  async function handleSubmit() {
    try {
      const hash = await execute()
      toast.success(`Swap confirmed · ${hash.slice(0, 10)}…`)
    } catch (e) {
      toast.error(e?.reason || e?.shortMessage || e?.message || 'Swap failed')
    }
  }

  const canSubmit = account && market && n > 0 && !!quote && !loading && !quoting

  /* Compute human-readable rate from quote */
  let rateLabel = null
  if (quote && n > 0) {
    const outN = Number(formatUnits(quote.amountOut, 18))
    if (side === 'buy' && outN > 0) {
      const usdcPerToken = n / outN
      rateLabel = `1 ${market.symbol} ≈ $${usdcPerToken.toFixed(4)}`
    } else if (side === 'sell' && n > 0) {
      const usdcPerToken = outN / n
      rateLabel = `1 ${market.symbol} ≈ $${usdcPerToken.toFixed(4)}`
    }
  }

  /* Pool depth: token reserve × oracle price */
  const poolUsdc = market ? (market.tokenReserve * market.price) : 0

  return (
    <div className="d-panel-body" style={{ gap: 14 }}>

      {/* Market selector + price */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <select
          style={{
            background: 'var(--surface-2)', border: '1px solid var(--border-2)',
            borderRadius: 'var(--r-sm)', padding: '7px 10px',
            color: 'var(--text-1)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={markets.length === 0}
        >
          {markets.length === 0
            ? <option value="">Loading markets…</option>
            : markets.map((m) => (
                <option key={m.id} value={m.id}>{m.symbol} / USDC</option>
              ))
          }
        </select>

        {market && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {fmtPriceRaw(market.price)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Pool: ${poolUsdc >= 1000
                ? (poolUsdc / 1000).toFixed(1) + 'K'
                : poolUsdc.toFixed(0)}
            </div>
          </div>
        )}
      </div>

      {/* Buy / Sell toggle */}
      <div className="mode-toggle">
        <button
          className={`mode-btn ${side === 'buy'  ? 'active' : ''}`}
          onClick={() => setSide('buy')}
        >Buy</button>
        <button
          className={`mode-btn ${side === 'sell' ? 'active' : ''}`}
          onClick={() => setSide('sell')}
        >Sell</button>
      </div>

      {/* You Pay */}
      <div className="trade-section">
        <div className="trade-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span>You Pay ({paySym})</span>
          {account && (
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Bal: {fmtBal(payBal)} {paySym}
            </span>
          )}
        </div>
        <div style={{
          background: 'var(--surface-2)', border: '1.5px solid var(--border-2)',
          borderRadius: 'var(--r)', padding: '12px 14px',
        }}>
          <input
            style={{
              background: 'none', border: 'none', fontSize: 22, fontWeight: 700,
              color: 'var(--text-1)', width: '100%', outline: 'none',
              fontFamily: 'var(--font-mono)',
            }}
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {account && (
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  className="btn btn-ghost"
                  style={{ flex: 1, fontSize: 11, padding: '3px 0' }}
                  onClick={() => setAmountPct(pct)}
                >
                  {pct === 100 ? 'Max' : `${pct}%`}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* You Receive */}
      <div className="trade-section">
        <div className="trade-label">You Receive ({rcvSym})</div>
        <div style={{
          background: 'var(--surface-2)', border: '1.5px solid var(--border-2)',
          borderRadius: 'var(--r)', padding: '14px',
          minHeight: 52, display: 'flex', alignItems: 'center',
        }}>
          {quoting
            ? <span style={{ fontSize: 14, color: 'var(--text-3)', fontStyle: 'italic' }}>Quoting…</span>
            : <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>
                {quote ? fmtAmt(quote.amountOut) : <span style={{ color: 'var(--text-4)' }}>—</span>}
              </span>
          }
        </div>
      </div>

      {/* Rate, fee, slippage */}
      {quote && n > 0 && (
        <div style={{
          fontSize: 12, color: 'var(--text-3)', padding: '8px 10px',
          background: 'var(--surface-2)', borderRadius: 'var(--r-sm)',
          fontFamily: 'var(--font-mono)', display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {rateLabel && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Rate</span><span>{rateLabel}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Fee</span>
            <span>{fmtAmt(quote.fee)} {rcvSym}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Max slippage</span><span>0.5%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Oracle price</span>
            <span>{fmtOraclePrice(quote.priceUSD)}</span>
          </div>
        </div>
      )}

      {/* Submit */}
      {account ? (
        <button
          className="btn btn-xl btn-block btn-primary"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {loading
            ? <><span className="spinner" /> {step || 'Swapping…'}</>
            : !market
              ? 'No markets available'
              : n <= 0
                ? 'Enter amount'
                : !quote
                  ? 'Getting quote…'
                  : `${side === 'buy' ? 'Buy' : 'Sell'} ${market.symbol}`
          }
        </button>
      ) : (
        <button
          className="btn btn-xl btn-block btn-primary"
          onClick={onConnect}
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
      )}

      {markets.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-4)', textAlign: 'center', lineHeight: 1.5 }}>
          Loading spot markets from chain…
        </div>
      )}
    </div>
  )
}
