/**
 * ui.js — UI helpers for CALL.LOG
 *
 * Handles:
 *  - Receipt item rendering
 *  - Toast notifications
 *  - Typewriter text effect
 *  - Relay status list rendering
 */

import { truncateNpub, formatTs } from './nostr.js';

/* ── Toast Notifications ── */

let _toastWrap = null;

function ensureToastWrap() {
  if (!_toastWrap) {
    _toastWrap = document.createElement('div');
    _toastWrap.className = 'toast-wrap';
    document.body.appendChild(_toastWrap);
  }
  return _toastWrap;
}

/* Duration in ms that matches the CSS toastOut animation (0.35s) */
const TOAST_FADE_MS = 350;

/**
 * Show a toast notification.
 * @param {string} msg
 * @param {'success'|'error'|'info'} type
 * @param {number} duration — ms before auto-remove
 */
export function toast(msg, type = 'info', duration = 3000) {
  const wrap = ensureToastWrap();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.addEventListener('animationend', () => el.remove(), { once: true });
    /* fallback in case animation doesn't fire */
    setTimeout(() => el.remove(), TOAST_FADE_MS);
  }, duration);
}

/* ── Feed Item Rendering ── */

/**
 * Create a receipt-style feed item element.
 * @param {object} event  — Nostr event
 * @returns {HTMLLIElement}
 */
export function renderFeedItem(event) {
  const li = document.createElement('li');
  li.className = 'feed-item';
  li.dataset.id = event.id;

  const meta = document.createElement('div');
  meta.className = 'feed-meta';

  const npubEl = document.createElement('span');
  npubEl.className = 'feed-npub';
  npubEl.textContent = truncateNpub(event.pubkey);

  const timeEl = document.createElement('span');
  timeEl.className = 'feed-time';
  timeEl.textContent = formatTs(event.created_at);

  meta.appendChild(npubEl);
  meta.appendChild(timeEl);

  const content = document.createElement('div');
  content.className = 'feed-content';
  content.textContent = event.content;

  li.appendChild(meta);
  li.appendChild(content);
  return li;
}

/**
 * Prepend or append a feed item to a list, deduplicating by event id.
 * @param {HTMLUListElement} listEl
 * @param {object}           event
 * @param {'prepend'|'append'} position
 */
export function upsertFeedItem(listEl, event, position = 'prepend') {
  if (listEl.querySelector(`[data-id="${event.id}"]`)) return;
  const item = renderFeedItem(event);
  if (position === 'prepend') {
    listEl.insertBefore(item, listEl.firstChild);
  } else {
    listEl.appendChild(item);
  }
}

/* ── Empty State ── */

export function showEmptyState(listEl, message) {
  if (listEl.querySelector('.empty-state')) return;
  const li = document.createElement('li');
  li.className = 'feed-item feed-loading empty-state';
  li.textContent = message;
  listEl.appendChild(li);
}

export function clearEmptyState(listEl) {
  const el = listEl.querySelector('.empty-state');
  if (el) el.remove();
}

/* ── Typewriter effect ── */

/**
 * Animate text appearing character by character into an element.
 * @param {HTMLElement} el
 * @param {string}      text
 * @param {number}      speed — ms per character
 * @returns {Promise<void>} resolves when done
 */
export function typewriter(el, text, speed = 40) {
  return new Promise(resolve => {
    el.textContent = '';
    el.classList.add('typewriter');
    let i = 0;
    const tick = () => {
      if (i < text.length) {
        el.textContent += text[i++];
        setTimeout(tick, speed);
      } else {
        el.classList.remove('typewriter');
        resolve();
      }
    };
    tick();
  });
}

/* ── Relay Status List ── */

/**
 * Render the relay status list into a container element.
 * @param {HTMLElement} containerEl
 * @param {string[]}    relays
 * @param {object}      statusMap  — { url: 'connected'|'connecting'|'disconnected' }
 */
export function renderRelayList(containerEl, relays, statusMap) {
  containerEl.innerHTML = '';
  if (!relays.length) {
    containerEl.textContent = 'No relays configured.';
    return;
  }
  for (const url of relays) {
    const row = document.createElement('div');
    row.className = 'relay-item';

    const left = document.createElement('span');
    const dot = document.createElement('span');
    const status = statusMap[url] || 'connecting';
    dot.className = `relay-status ${status}`;
    left.appendChild(dot);
    left.appendChild(document.createTextNode(url.replace('wss://', '')));

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-secondary relay-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove relay';
    removeBtn.dataset.relayUrl = url;

    row.appendChild(left);
    row.appendChild(removeBtn);
    containerEl.appendChild(row);
  }
}

/* ── Follow Chip ── */

/**
 * Render a follow chip element.
 * @param {string} hexPubkey
 * @returns {HTMLDivElement}
 */
export function renderFollowChip(hexPubkey) {
  const chip = document.createElement('div');
  chip.className = 'follow-chip';
  chip.dataset.pubkey = hexPubkey;

  const label = document.createElement('span');
  label.textContent = truncateNpub(hexPubkey);

  const removeBtn = document.createElement('button');
  removeBtn.textContent = '✕';
  removeBtn.title = 'Remove';
  removeBtn.dataset.pubkey = hexPubkey;

  chip.appendChild(label);
  chip.appendChild(removeBtn);
  return chip;
}

/* ── Loading spinner (text-based) ── */

export function showLoading(el, msg = 'LOADING…') {
  el.textContent = msg;
  el.classList.add('typewriter');
}

export function hideLoading(el) {
  el.classList.remove('typewriter');
}
