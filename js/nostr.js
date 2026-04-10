/**
 * nostr.js — Nostr protocol wrapper for CALL.LOG
 *
 * Handles:
 *  - Relay pool management (WSS only)
 *  - Publishing kind 1 text notes (NIP-01)
 *  - Subscribing to feeds
 *  - NIP-51 people-list (kind 30000) fetch & publish
 */

import { SimplePool, nip19 } from 'https://esm.sh/nostr-tools@2.7.2';

/* ── Default relays ── */
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
];

let _relays = [...DEFAULT_RELAYS];
let _pool   = new SimplePool();

/* relay connection status map { url: 'connected'|'connecting'|'disconnected' } */
const _relayStatus = {};

export function getRelays()       { return [..._relays]; }
export function getRelayStatus()  { return { ..._relayStatus }; }

/**
 * Add a relay URL (must be WSS).
 * @returns {boolean} true if added, false if invalid/duplicate
 */
export function addRelay(url) {
  const clean = url.trim().toLowerCase();
  if (!clean.startsWith('wss://')) return false;
  if (_relays.includes(clean)) return false;
  _relays.push(clean);
  return true;
}

/**
 * Remove a relay URL.
 */
export function removeRelay(url) {
  _relays = _relays.filter(r => r !== url);
}

/**
 * Reset relays to defaults.
 */
export function resetRelays() {
  _relays = [...DEFAULT_RELAYS];
  _pool.close(_relays);
  _pool = new SimplePool();
}

/* ── Publishing ── */

/**
 * Publish a signed event to all configured relays.
 * @param {object} signedEvent
 * @returns {Promise<string[]>} array of relay URLs where publish succeeded
 */
export async function publishEvent(signedEvent) {
  const results = await Promise.allSettled(
    _pool.publish(_relays, signedEvent)
  );
  const ok = _relays.filter((_, i) =>
    results[i]?.status === 'fulfilled'
  );
  return ok;
}

/* ── Subscriptions ── */

/**
 * Subscribe to kind 1 notes from a list of pubkeys.
 * @param {string[]} pubkeys   — hex pubkeys
 * @param {function} onEvent   — called with each event
 * @param {function} onEose    — called when EOSE received
 * @returns {object} subscription handle (call .close() to unsubscribe)
 */
export function subscribeToFeed(pubkeys, onEvent, onEose) {
  if (!pubkeys.length) return { close: () => {} };
  const sub = _pool.subscribeMany(
    _relays,
    [{
      kinds: [1],
      authors: pubkeys,
      limit: 50,
    }],
    {
      onevent: onEvent,
      oneose:  onEose || (() => {}),
    }
  );
  return sub;
}

/**
 * Fetch the most recent kind 1 notes from a list of pubkeys.
 * @param {string[]} pubkeys
 * @param {number}   limit
 * @returns {Promise<object[]>} sorted events (newest first)
 */
export async function fetchFeed(pubkeys, limit = 30) {
  if (!pubkeys.length) return [];
  const events = await _pool.querySync(
    _relays,
    { kinds: [1], authors: pubkeys, limit }
  );
  return events.sort((a, b) => b.created_at - a.created_at);
}

/**
 * Fetch the user's own kind 1 notes.
 * @param {string} pubkey  — hex
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
export async function fetchOwnNotes(pubkey, limit = 20) {
  return fetchFeed([pubkey], limit);
}

/* ── NIP-51 People List (kind 30000) ── */

/**
 * Fetch the user's NIP-51 "follow" list (kind 30000, d="calllog").
 * @param {string} pubkey — hex
 * @returns {Promise<string[]>} array of followed hex pubkeys
 */
export async function fetchFollowList(pubkey) {
  try {
    const events = await _pool.querySync(
      _relays,
      {
        kinds: [30000],
        authors: [pubkey],
        '#d': ['calllog'],
        limit: 1,
      }
    );
    if (!events.length) return [];
    const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
    return latest.tags
      .filter(t => t[0] === 'p')
      .map(t => t[1]);
  } catch (_) {
    return [];
  }
}

/**
 * Publish a NIP-51 people list (kind 30000) to all relays.
 * @param {string[]} hexPubkeys  — list of followed pubkeys
 * @param {function} signEvent   — auth.signEvent
 * @returns {Promise<object>} the published event
 */
export async function publishFollowList(hexPubkeys, signEvent) {
  const now = Math.floor(Date.now() / 1000);
  const eventTemplate = {
    kind: 30000,
    created_at: now,
    tags: [
      ['d', 'calllog'],
      ...hexPubkeys.map(pk => ['p', pk]),
    ],
    content: '',
  };
  const signed = await signEvent(eventTemplate);
  await publishEvent(signed);
  return signed;
}

/* ── NIP-19 helpers ── */

/**
 * Decode an npub1 or nprofile string to a hex pubkey.
 * @param {string} input
 * @returns {{ ok: boolean, hex?: string, error?: string }}
 */
export function decodeNpub(input) {
  const trimmed = input.trim();
  try {
    if (trimmed.startsWith('npub1')) {
      const d = nip19.decode(trimmed);
      if (d.type !== 'npub') return { ok: false, error: 'Not an npub' };
      return { ok: true, hex: d.data };
    }
    if (trimmed.startsWith('nprofile1')) {
      const d = nip19.decode(trimmed);
      if (d.type !== 'nprofile') return { ok: false, error: 'Not an nprofile' };
      return { ok: true, hex: d.data.pubkey };
    }
    if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      return { ok: true, hex: trimmed.toLowerCase() };
    }
    return { ok: false, error: 'Enter npub1… , nprofile1… , or 64-char hex' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Encode a hex pubkey to truncated npub.
 */
export function truncateNpub(hexPubkey) {
  try {
    const npub = nip19.npubEncode(hexPubkey);
    return npub.slice(0, 12) + '…' + npub.slice(-5);
  } catch (_) {
    return hexPubkey.slice(0, 8) + '…';
  }
}

/**
 * Format a unix timestamp to HH:MM DD/MM/YY.
 */
export function formatTs(unixSec) {
  const d = new Date(unixSec * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
}
