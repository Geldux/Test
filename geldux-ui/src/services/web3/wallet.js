/**
 * wallet.js
 *
 * Wallet connection, provider/signer lifecycle, network switching,
 * contract instance cache, and RPC rotation.
 *
 * Extracted from legacy/index.html — behaviour preserved exactly.
 * No UI wiring. No trade flows.
 *
 * NOTE: wsConnect() and the live contract-event refresh callback that
 * live inside connectWallet() in the legacy app are intentionally omitted
 * here.  They will be wired by the ws.js module (not extracted yet) after
 * that extraction step is complete.
 */

import { BrowserProvider, JsonRpcProvider, Contract } from 'ethers'
import {
  CHAIN_ID,
  CHAIN_HEX,
  BASE_CHAIN_PARAMS,
  ADDRESSES,
  ALCHEMY_RPC,
  RPC_LIST,
  USDC_DECIMALS,
} from './config.js'
import {
  ABI_ERC20,
  ABI_SPOT,
  ABI_PERP,
  ABI_FAUCET,
  ABI_PTS,
  ABI_PYTH,
} from './contracts.js'

// ── Module-level state (mirrors legacy var provider, signer, account) ─────
// These are intentionally module-scoped, not exported directly —
// use the accessor functions below to read them from outside this module.

let _provider    = null
let _signer      = null
let _account     = null
let _ctrs        = {}    // contract instance cache — keyed by address
let _rpcIdx      = 0
let _alchemyProv = null  // dedicated Alchemy provider (avoids MetaMask 429s)

// ── RPC rotation ──────────────────────────────────────────────────────────
// Mirrors legacy nextRpc() — called by polling helpers on rate-limit errors.

export function nextRpc() {
  _rpcIdx = (_rpcIdx + 1) % RPC_LIST.length
  return RPC_LIST[_rpcIdx]
}

// ── Dedicated Alchemy provider ────────────────────────────────────────────
// Used for tx receipt polling and read-only calls to bypass MetaMask 429s.
// Mirrors legacy getConfirmProvider().

export function getConfirmProvider() {
  if (!_alchemyProv) {
    try {
      _alchemyProv = new JsonRpcProvider(ALCHEMY_RPC, undefined, {
        polling:       false,
        staticNetwork: true,
      })
    } catch (e) {
      _alchemyProv = null
    }
  }
  return _alchemyProv
}

// Alias used in legacy for read-only calls (e.g. isPythFresh, spot quote checks).
export const getReadProvider = getConfirmProvider

// ── State accessors ───────────────────────────────────────────────────────
// Read-only outside this module — mutation only happens via connectWallet/resetWallet.

export const getProvider = () => _provider
export const getSigner   = () => _signer
export const getAccount  = () => _account

// ── Contract instance cache ───────────────────────────────────────────────
// Mirrors legacy gc(addr, abi).
// Caches one Contract instance per address to avoid redundant instantiation.
// Returns null if signer is not ready or address is zero.

export function gc(addr, abi) {
  if (
    !_signer ||
    !addr ||
    addr === '0x0000000000000000000000000000000000000000'
  ) {
    return null
  }
  if (!_ctrs[addr]) {
    _ctrs[addr] = new Contract(addr, abi, _signer)
  }
  return _ctrs[addr]
}

// Named contract getters — mirror legacy cUSDC(), cSPOT(), cPERP(), etc.
export const cUSDC = ()      => gc(ADDRESSES.USDC,   ABI_ERC20)
export const cSPOT = ()      => gc(ADDRESSES.SPOT,   ABI_SPOT)
export const cPERP = ()      => gc(ADDRESSES.PERP,   ABI_PERP)
export const cFAU  = ()      => gc(ADDRESSES.FAUCET, ABI_FAUCET)
export const cPTS  = ()      => gc(ADDRESSES.PTS,    ABI_PTS)
export const cPYTH = ()      => gc(ADDRESSES.PYTH,   ABI_PYTH)
export const cTKN  = (addr)  => gc(addr,             ABI_ERC20)

// ── USDC decimal runtime validation ──────────────────────────────────────
// Legacy mutated the global USDC_DEC at connect time via initUsdcDec().
// In the module system USDC_DECIMALS is a config constant (18) — validated
// here at runtime against the live contract and warned on mismatch.

async function _initUsdcDec() {
  try {
    const c = new Contract(ADDRESSES.USDC, ABI_ERC20, _provider)
    const d = await c.decimals()
    const confirmed = Number(d)
    if (confirmed !== USDC_DECIMALS) {
      console.warn(
        `[wallet] USDC decimals mismatch: on-chain=${confirmed}, ` +
        `config=${USDC_DECIMALS}. Update USDC_DECIMALS in config.js.`,
      )
    } else {
      console.log('[wallet] USDC decimals confirmed:', confirmed)
    }
  } catch (er) {
    console.warn(
      `[wallet] Could not read USDC decimals, falling back to ${USDC_DECIMALS}:`,
      er.message,
    )
  }
}

// ── Network switching ─────────────────────────────────────────────────────
// Mirrors the inline chain-switch block inside legacy connectWallet().
// Tries wallet_switchEthereumChain first; falls back to wallet_addEthereumChain
// on code 4902 (chain not added) or -32603 (some wallets use this instead).

async function _ensureNetwork() {
  const net = await _provider.getNetwork()
  if (Number(net.chainId) === CHAIN_ID) return

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_HEX }],
    })
  } catch (er) {
    if (er.code === 4902 || er.code === -32603) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [BASE_CHAIN_PARAMS],
      })
    } else {
      throw er
    }
  }

  // Small delay to let the wallet settle before re-instantiating the provider.
  // Mirrors the legacy `await new Promise(r => setTimeout(r, 400))`.
  await new Promise((r) => setTimeout(r, 400))

  _provider = new BrowserProvider(window.ethereum)

  const n2 = await _provider.getNetwork()
  if (Number(n2.chainId) !== CHAIN_ID) {
    throw new Error(`Switch to Base Sepolia (Chain ${CHAIN_ID}) in MetaMask.`)
  }
}

// ── connectWallet ─────────────────────────────────────────────────────────
// Mirrors legacy connectWallet() exactly.
// Returns the connected account address (lowercase).

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('No wallet. Open in MetaMask browser.')
  }

  const accs = await window.ethereum.request({ method: 'eth_requestAccounts' })
  if (!accs || !accs.length) {
    throw new Error('No accounts returned. Unlock MetaMask.')
  }

  _provider = new BrowserProvider(window.ethereum)

  await _ensureNetwork()

  // Flush cached contract instances after any provider/network change.
  // Mirrors legacy `ctrs = {}` before getSigner().
  _ctrs = {}

  _signer  = await _provider.getSigner()
  _account = (await _signer.getAddress()).toLowerCase()

  await _initUsdcDec()

  // ── Event listeners ──────────────────────────────────────────────────
  // Remove all first to prevent duplicate handlers on reconnect.
  // Both events trigger a full page reload, matching legacy behaviour.
  window.ethereum.removeAllListeners?.()
  window.ethereum.on('accountsChanged', () => window.location.reload())
  window.ethereum.on('chainChanged',    () => window.location.reload())

  return _account
}

// ── resetWallet ───────────────────────────────────────────────────────────
// Clears all module state without reloading the page.
// The legacy app reloaded on disconnect; this is a clean-module equivalent
// for use in tests or explicit disconnect flows.

export function resetWallet() {
  _provider    = null
  _signer      = null
  _account     = null
  _ctrs        = {}
  _alchemyProv = null
  _rpcIdx      = 0
}
