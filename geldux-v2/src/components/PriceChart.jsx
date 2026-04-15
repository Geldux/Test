import { useEffect, useRef } from 'react'
import { createChart, LineSeries, LineStyle, CrosshairMode } from 'lightweight-charts'

/* ── Per-session tick store ─────────────────────────────────────────
   Module-level so history survives sym switches and component
   remounts for the lifetime of the browser session.
   Capped at 1000 ticks per symbol (~2.2 h at the 8 s Hermes interval).
──────────────────────────────────────────────────────────────────── */
const _ticks = new Map()  /* sym → Array<{time: number, value: number}> */

function pushTick(sym, value) {
  if (!_ticks.has(sym)) _ticks.set(sym, [])
  const store = _ticks.get(sym)
  const time  = Math.floor(Date.now() / 1000)
  const last  = store[store.length - 1]
  if (last && last.time >= time) {
    last.value = value                   // overwrite same-second point
  } else {
    store.push({ time, value })
    if (store.length > 1000) store.shift()
  }
}

/* ── Theme palette ───────────────────────────────────────────────── */
function palette(isDark) {
  return isDark ? {
    bg:     '#111111',
    grid:   '#1e1e1e',
    text:   '#8e8e93',
    cross:  '#3a3a3c',
    border: '#222222',
  } : {
    bg:     '#ffffff',
    grid:   '#e5e5ea',
    text:   '#8e8e93',
    cross:  '#c7c7cc',
    border: '#e5e5ea',
  }
}

/* ── PriceChart ──────────────────────────────────────────────────────
   Live line chart powered by TradingView Lightweight Charts.

   Props
     sym      — 'BTC' | 'ETH' | 'SOL'
     prices   — from usePrices() — { [sym]: { price?, mark? } }
     isDark   — from useTheme()

   Extension points (not yet wired — add when needed):
     • seriesRef.current.createPriceLine({ price, color, title })
         Use for entry price / TP / SL / liquidation horizontal lines.
     • createSeriesMarkers(seriesRef.current, markers)
         Use for order placement markers on the time axis.
──────────────────────────────────────────────────────────────────── */
export function PriceChart({ sym, prices, isDark }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)
  const seriesRef    = useRef(null)
  const symRef       = useRef(sym)   /* tracks current sym without re-running init */

  /* ── Create chart once ── */
  useEffect(() => {
    if (!containerRef.current) return
    const t = palette(isDark)

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background:  { color: t.bg },
        textColor:   t.text,
        fontFamily:  "ui-monospace, 'SF Mono', Menlo, monospace",
        fontSize:    11,
      },
      grid: {
        vertLines: { color: t.grid, style: LineStyle.Dotted },
        horzLines: { color: t.grid, style: LineStyle.Dotted },
      },
      crosshair: {
        mode:     CrosshairMode.Normal,
        vertLine: { color: t.cross, labelBackgroundColor: t.border },
        horzLine: { color: t.cross, labelBackgroundColor: t.border },
      },
      rightPriceScale: {
        borderColor:  t.border,
        textColor:    t.text,
        scaleMargins: { top: 0.15, bottom: 0.15 },
      },
      timeScale: {
        borderColor:    t.border,
        textColor:      t.text,
        timeVisible:    true,
        secondsVisible: false,
      },
    })

    const series = chart.addSeries(LineSeries, {
      color:                  '#00c805',
      lineWidth:              2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius:  4,
      lastValueVisible:       true,
      priceLineVisible:       true,
      priceLineStyle:         LineStyle.Dashed,
      priceLineColor:         '#00c805',
      priceLineWidth:         1,
    })

    chartRef.current  = chart
    seriesRef.current = series

    /* Seed with any ticks already in memory for this sym */
    const existing = _ticks.get(sym)
    if (existing?.length) {
      series.setData([...existing])
      chart.timeScale().fitContent()
    }

    /* Resize whenever the container dimensions change */
    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return
      chartRef.current.resize(
        containerRef.current.clientWidth,
        containerRef.current.clientHeight
      )
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current  = null
      seriesRef.current = null
    }
  }, []) // chart is created once; theme/sym handled by separate effects

  /* ── Apply theme when isDark toggles ── */
  useEffect(() => {
    if (!chartRef.current) return
    const t = palette(isDark)
    chartRef.current.applyOptions({
      layout: { background: { color: t.bg }, textColor: t.text },
      grid:   { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      crosshair: {
        vertLine: { color: t.cross, labelBackgroundColor: t.border },
        horzLine: { color: t.cross, labelBackgroundColor: t.border },
      },
      rightPriceScale: { borderColor: t.border, textColor: t.text },
      timeScale:       { borderColor: t.border, textColor: t.text },
    })
  }, [isDark])

  /* ── Reload tick history when sym changes ── */
  useEffect(() => {
    symRef.current = sym
    if (!seriesRef.current) return
    const existing = _ticks.get(sym)
    seriesRef.current.setData(existing?.length ? [...existing] : [])
    if (existing?.length && chartRef.current) chartRef.current.timeScale().fitContent()
  }, [sym])

  /* ── Push live price tick ── */
  useEffect(() => {
    const price = prices[sym]?.price ?? prices[sym]?.mark
    if (!price || price <= 0) return
    pushTick(sym, price)
    if (!seriesRef.current || symRef.current !== sym) return
    const store = _ticks.get(sym)
    const last  = store?.[store.length - 1]
    if (last) seriesRef.current.update({ ...last })
  }, [prices, sym])

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      {/* Attribution as requested by TradingView */}
      <a
        href="https://www.tradingview.com"
        target="_blank"
        rel="noreferrer"
        style={{
          position: 'absolute', bottom: 6, right: 8,
          fontSize: 10, color: '#48484a',
          textDecoration: 'none', zIndex: 2,
          fontFamily: 'inherit', lineHeight: 1,
        }}
      >
        Powered by TradingView
      </a>
    </div>
  )
}
