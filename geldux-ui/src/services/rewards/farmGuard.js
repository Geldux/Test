/**
 * farmGuard.js
 *
 * Anti-bot / reward eligibility system.
 * Light, fair, user-friendly. No hard blocks.
 * Users can always trade. Only points/rewards are gated.
 *
 * Extracted from legacy/index.html — behaviour preserved exactly.
 * Session memory only (resets on page reload), matching legacy.
 *
 * Public API (exposed on the exported farmGuard object)
 *   farmGuard.onOpen(posId, sym, colUSD)      — call when a position is opened
 *   farmGuard.onClose(posId, sym)             — call when a position is closed
 *                                               returns { eligible, reason, pointsMult, score }
 *   farmGuard.checkTrade(colUSD)              — pre-trade eligibility check
 *                                               returns { eligible, reason, pointsMult? }
 *   farmGuard.score()                         — current trust score (0–100)
 *   farmGuard.friendlyMsg(reason)             — pass-through (already friendly)
 */

// Mirrors legacy var _farmGuard = (function(){ ... })();

export var farmGuard = (function () {
  /* ── Config ── */
  var MIN_HOLD_MS       = 30000   /* 30s min hold before closing earns points */
  var MIN_USDC_FOR_PTS  = 5       /* min $5 trade to earn points */
  var BURST_WINDOW_MS   = 120000  /* 2 min window to count bursts */
  var BURST_LIMIT       = 5       /* >5 trades in 2 min = reduced points */
  var ROUNDTRIP_MS      = 60000   /* open+close within 60s = no points */

  /* ── State (session memory) ── */
  var _opens        = {}   /* posId → { time, sym, col } */
  var _recentTrades = []   /* timestamps of all trades */
  var _score        = 100  /* 100 = full trust, 0 = suspicious */

  function _burstCount() {
    var now = Date.now()
    _recentTrades = _recentTrades.filter(function (t) { return now - t < BURST_WINDOW_MS })
    return _recentTrades.length
  }

  function _penalise(pts) { _score = Math.max(0, _score - pts) }
  function _recover()     { _score = Math.min(100, _score + 2) } /* slow recovery */

  return {
    /* Called when a position is opened */
    onOpen: function (posId, sym, colUSD) {
      _opens[posId] = { time: Date.now(), sym: sym, col: colUSD }
      _recentTrades.push(Date.now())
      if (_burstCount() > BURST_LIMIT) _penalise(10)
    },

    /* Called when a position is closed */
    /* Returns {eligible:bool, reason:string, pointsMult:number} */
    onClose: function (posId, sym) {
      var open = _opens[posId]
      var eligible = true, reason = '', mult = 1.0
      if (open) {
        var heldMs = Date.now() - open.time
        if (heldMs < ROUNDTRIP_MS) {
          eligible = false
          reason = 'Quick round-trip trades are not reward-eligible.'
          _penalise(15)
        } else if (heldMs < MIN_HOLD_MS) {
          mult = 0.3
          reason = 'Short hold time. Partial points only.'
        }
        if (open.col < MIN_USDC_FOR_PTS) {
          eligible = false
          reason = 'Trade too small for reward eligibility.'
        }
        delete _opens[posId]
      }
      if (_burstCount() > BURST_LIMIT) {
        mult = mult * 0.5
        reason = reason || 'High trading frequency detected. Reduced points this session.'
      }
      _recover()
      return { eligible: eligible, reason: reason, pointsMult: mult, score: _score }
    },

    /* Check if a new trade qualifies for full points */
    checkTrade: function (colUSD) {
      if (colUSD < MIN_USDC_FOR_PTS) return { eligible: false, reason: 'Trade size below $' + MIN_USDC_FOR_PTS + ' minimum for rewards.' }
      if (_score < 30) return { eligible: false, reason: 'Rewards optimised for normal trading activity.' }
      if (_burstCount() >= BURST_LIMIT) return { eligible: true, reason: 'High frequency detected. Reduced points this session.', pointsMult: 0.5 }
      return { eligible: true, reason: '', pointsMult: 1.0 }
    },

    score: function () { return _score },

    /* Friendly UI message (never scary) */
    friendlyMsg: function (reason) {
      if (!reason) return ''
      return reason /* already friendly from above */
    }
  }
})()
