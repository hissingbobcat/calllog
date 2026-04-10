/**
 * auth.js — Key management for CALL.LOG
 *
 * Handles:
 *  - NIP-07 browser extension detection (window.nostr)
 *  - Ephemeral nsec fallback (held only in memory, never persisted)
 *  - Login / logout, key material clearing
 */

import { getPublicKey, finalizeEvent, nip19 } from 'https://esm.sh/nostr-tools@2.7.2';

/* Inline helper — avoids importing @noble/hashes separately */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/* Private, module-scoped — never exported directly */
let _privkeyBytes = null;  /* Uint8Array private key, in-memory only */
let _pubkey       = null;  /* hex public key */
let _authMode     = null;  /* 'nip07' | 'nsec' */
let _onChangeListeners = [];

export function onAuthChange(fn) {
  _onChangeListeners.push(fn);
}

function _notify() {
  for (const fn of _onChangeListeners) {
    try { fn(getAuthState()); } catch (_) { /* ignore */ }
  }
}

export function getAuthState() {
  return {
    loggedIn: !!_pubkey,
    pubkey:   _pubkey,
    mode:     _authMode,
  };
}

/**
 * Try to log in via NIP-07 extension (window.nostr).
 * Returns true on success, false if no extension found.
 */
export async function loginWithNip07() {
  if (typeof window === 'undefined' || !window.nostr) return false;
  try {
    const pub = await window.nostr.getPublicKey();
    if (!pub) return false;
    _pubkey       = pub;
    _privkeyBytes = null;
    _authMode = 'nip07';
    _notify();
    return true;
  } catch (err) {
    console.warn('[auth] NIP-07 login failed:', err.message);
    return false;
  }
}

/**
 * Log in with an nsec string (bech32) or raw hex private key.
 * Key is held ONLY in memory — never written to any storage.
 * @param {string} nsecOrHex
 * @returns {{ ok: boolean, error?: string }}
 */
export function loginWithNsec(nsecOrHex) {
  try {
    let keyBytes;
    const trimmed = nsecOrHex.trim();
    if (trimmed.startsWith('nsec1')) {
      const decoded = nip19.decode(trimmed);
      if (decoded.type !== 'nsec') return { ok: false, error: 'Invalid nsec' };
      /* nip19.decode returns the raw Uint8Array for nsec */
      keyBytes = decoded.data;
    } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      keyBytes = hexToBytes(trimmed.toLowerCase());
    } else {
      return { ok: false, error: 'Must be nsec1… or 64-char hex' };
    }

    _privkeyBytes = keyBytes;
    _pubkey       = getPublicKey(keyBytes);
    _authMode     = 'nsec';
    _notify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Sign a Nostr event.
 * Uses NIP-07 extension when available, otherwise signs in-memory key.
 * @param {object} eventTemplate — unsigned event (kind, content, tags, created_at)
 * @returns {Promise<object>} signed event
 */
export async function signEvent(eventTemplate) {
  if (_authMode === 'nip07') {
    return await window.nostr.signEvent(eventTemplate);
  }
  if (_authMode === 'nsec' && _privkeyBytes) {
    return finalizeEvent(eventTemplate, _privkeyBytes);
  }
  throw new Error('Not authenticated');
}

/**
 * Clear all key material from memory and fire the change callback.
 */
export function logout() {
  if (_privkeyBytes) _privkeyBytes.fill(0);  /* zero out key bytes */
  _privkeyBytes = null;
  _pubkey       = null;
  _authMode     = null;
  _notify();
}

/**
 * Return the logged-in public key as a bech32 npub.
 */
export function getNpubDisplay() {
  if (!_pubkey) return '';
  try {
    const npub = nip19.npubEncode(_pubkey);
    return npub.slice(0, 12) + '…' + npub.slice(-6);
  } catch (_) {
    return _pubkey.slice(0, 8) + '…';
  }
}

export function getPubkey() { return _pubkey; }
export function getAuthMode() { return _authMode; }
