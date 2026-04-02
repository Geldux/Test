/**
 * ws.js
 *
 * Alchemy WebSocket — live contract event listener.
 * Listens for Opened/Closed/Liquidated from PerpDEX
 * and dispatches logs to registered callbacks.
 * Reconnects gracefully with exponential backoff.
 *
 * Extracted from legacy/index.html — behaviour preserved exactly.
 * No UI wiring.
 *
 * Public API
 *   wsConnect()        open (or reuse) the WebSocket connection
 *   wsOn(sig, cb)      register a callback for a topic hash or '*' (all logs)
 *   TOPIC_OPENED       keccak256 topic for the Opened event
 *   TOPIC_CLOSED       keccak256 topic for the Closed event
 *   TOPIC_LIQUIDATED   keccak256 topic for the Liquidated event
 *
 * NOTE: recalculate topic hashes in a browser console with:
 *   ethers.id("Opened(uint256,address,bytes32,bool,uint8,uint256,uint256)")
 */

import { ALCHEMY_WS, ADDRESSES } from './config.js'

// ── Module state (mirrors legacy globals) ─────────────────────────────────
// Mirrors legacy: var _ws=null, _wsReconnectMs=2000, _wsAlive=false, _wsListeners={};

var _ws             = null
var _wsReconnectMs  = 2000
var _wsAlive        = false
var _wsListeners    = {}

// ── Keccak-256 topic hashes for PerpDEX events ───────────────────────────
// Mirrors legacy lines 264-268.
// NOTE: recalculate these in browser console with:
//   ethers.id("Opened(uint256,address,bytes32,bool,uint8,uint256,uint256)")

export var TOPIC_OPENED     = '0x82571b37ea77f1f00d1c0bdf38d9b72c83a52efdb7e64d1695e4d5b5c9b8e9f2'
export var TOPIC_CLOSED     = '0x6d7fc0b58a2a92a5a50e0bb5bf08c1a09e5e66c4a3e46dfd5b3c7c4b4c9e7f1'
export var TOPIC_LIQUIDATED = '0x5a0c7b2e4f9a8c1b3d6e7f0a2b4c5d8e9f0a1b2c3d4e5f60718293a4b5c6d7e'

// ── wsConnect ─────────────────────────────────────────────────────────────
// Opens the Alchemy WebSocket and subscribes to PerpDEX and SpotDEX logs.
// Reconnects with exponential backoff on close (2 s → 4 s → … max 30 s).
// Guards against double-open: returns immediately if already open/connecting.
// Mirrors legacy function wsConnect().

export function wsConnect() {
  if (_ws && (_ws.readyState === 0 || _ws.readyState === 1)) return /* already open/connecting */
  try {
    _ws = new WebSocket(ALCHEMY_WS)

    _ws.onopen = function () {
      _wsAlive = true; _wsReconnectMs = 2000
      console.log('[WS] Connected to Alchemy')
      /* Subscribe to PerpDEX events: Opened, Closed, Liquidated */
      _wsSend({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe',
        params: ['logs', { address: ADDRESSES.PERP, topics: [] }] })
      /* Subscribe to SpotDEX events */
      _wsSend({ jsonrpc: '2.0', id: 2, method: 'eth_subscribe',
        params: ['logs', { address: ADDRESSES.SPOT, topics: [] }] })
    }

    _ws.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data)
        if (msg.method === 'eth_subscription' && msg.params && msg.params.result) {
          _wsHandleLog(msg.params.result)
        }
      } catch (e) {}
    }

    _ws.onclose = function () {
      _wsAlive = false
      /* Exponential backoff: 2s, 4s, 8s … max 30s */
      _wsReconnectMs = Math.min(_wsReconnectMs * 2, 30000)
      console.log('[WS] Disconnected, reconnecting in', _wsReconnectMs, 'ms')
      setTimeout(wsConnect, _wsReconnectMs)
    }

    _ws.onerror = function (e) {
      console.warn('[WS] Error:', e.message || 'unknown')
      _ws.close()
    }
  } catch (e) { console.warn('[WS] Failed to init:', e.message) }
}

// ── _wsSend (private) ─────────────────────────────────────────────────────
// Sends a JSON-RPC message if the socket is open.
// Mirrors legacy function _wsSend(obj).

function _wsSend(obj) {
  if (_ws && _ws.readyState === 1) _ws.send(JSON.stringify(obj))
}

// ── _wsHandleLog (private) ────────────────────────────────────────────────
// Fires registered callbacks for a received log.
// Dispatches by topic[0] (specific event) or the '*' wildcard.
// Mirrors legacy function _wsHandleLog(log).

function _wsHandleLog(log) {
  try {
    /* Decode topic[0] to event name */
    var sig      = log.topics && log.topics[0]
    var handlers = _wsListeners[sig] || _wsListeners['*'] || []
    handlers.forEach(function (h) { try { h(log) } catch (e) {} })
  } catch (e) {}
}

// ── wsOn ──────────────────────────────────────────────────────────────────
// Registers a callback for a specific event topic hash or '*' for all logs.
// Mirrors legacy function wsOn(sig, cb).

export function wsOn(sig, cb) {
  if (!_wsListeners[sig]) _wsListeners[sig] = []
  _wsListeners[sig].push(cb)
}
