/**
 * app.js — Main application logic for CALL.LOG
 *
 * Handles:
 *  - View routing (landing → call | log)
 *  - Authentication UI (NIP-07 / nsec)
 *  - Compose & publish notes (CALL view)
 *  - Feed curation (LOG view)
 *  - Relay management
 */

import {
  loginWithNip07,
  loginWithNsec,
  logout,
  signEvent,
  getAuthState,
  onAuthChange,
  getNpubDisplay,
  getPubkey,
} from './auth.js';

import {
  getRelays,
  addRelay,
  removeRelay,
  publishEvent,
  subscribeToFeed,
  fetchFeed,
  fetchOwnNotes,
  fetchFollowList,
  publishFollowList,
  decodeNpub,
  truncateNpub,
  formatTs,
} from './nostr.js';

import {
  toast,
  renderFeedItem,
  upsertFeedItem,
  showEmptyState,
  clearEmptyState,
  renderRelayList,
  renderFollowChip,
  typewriter,
} from './ui.js';

/* ── Constants ── */
const NOTE_MAX_LEN = 280;

/* ── DOM refs ── */
const $ = id => document.getElementById(id);

/* Views */
const vLanding = $('landing');
const vCall    = $('view-call');
const vLog     = $('view-log');

/* Landing */
const logoCall = $('logo-call');
const logoLog  = $('logo-log');

/* Auth */
const authSection  = $('auth-section');
const nip07Btn     = $('btn-nip07');
const nsecInput    = $('nsec-input');
const nsecLoginBtn = $('btn-nsec-login');
const nsecWarning  = $('nsec-warning');
const loggedInBar  = $('logged-in-bar');
const npubDisplay  = $('npub-display');
const logoutBtn    = $('btn-logout');

/* Secondary auth displays in CALL / LOG views */
const npubDisplayCall = $('npub-display-call');
const npubDisplayLog  = $('npub-display-log');
const logoutCallBtn   = $('btn-logout-call');
const logoutLogBtn    = $('btn-logout-log');

/* CALL view */
const callNoteInput  = $('note-input');
const callCharCount  = $('char-count');
const publishBtn     = $('btn-publish');
const ownFeedList    = $('own-feed-list');

/* LOG view */
const followInput    = $('follow-input');
const addFollowBtn   = $('btn-add-follow');
const followListEl   = $('follow-list');
const curatedFeedList = $('curated-feed-list');
const saveListBtn    = $('btn-save-list');

/* Relay settings (shared across views) */
const relayCallList   = $('relay-list-call');
const relayLogList    = $('relay-list-log');
const addRelayCallInput = $('relay-input-call');
const addRelayLogInput  = $('relay-input-log');
const addRelayCallBtn   = $('btn-add-relay-call');
const addRelayLogBtn    = $('btn-add-relay-log');

/* Back buttons */
const backFromCall = $('btn-back-call');
const backFromLog  = $('btn-back-log');

/* ── App State ── */
let _followedPubkeys = [];   /* hex pubkeys being curated */
let _feedSub = null;          /* active feed subscription */

/* ── View Routing ── */

function showView(name) {
  [vLanding, vCall, vLog].forEach(v => v && v.classList.remove('active'));
  if (name === 'call')    vCall.classList.add('active');
  else if (name === 'log') vLog.classList.add('active');
  else                    vLanding.classList.add('active');
}

/* ── Auth UI ── */

function updateAuthUI(state) {
  if (!authSection || !loggedInBar) return;
  if (state.loggedIn) {
    const display = getNpubDisplay();
    authSection.style.display = 'none';
    loggedInBar.style.display = 'flex';
    if (npubDisplay)     npubDisplay.textContent     = display;
    if (npubDisplayCall) npubDisplayCall.textContent = display;
    if (npubDisplayLog)  npubDisplayLog.textContent  = display;
  } else {
    authSection.style.display = 'block';
    loggedInBar.style.display = 'none';
    /* Show NIP-07 button only if extension present */
    if (nip07Btn) {
      nip07Btn.style.display = window.nostr ? 'block' : 'none';
    }
    /* Show nsec section only if no NIP-07 */
    if (nsecWarning) {
      nsecWarning.style.display = window.nostr ? 'none' : 'block';
    }
  }
}

onAuthChange(updateAuthUI);

/* ── NIP-07 Login ── */
if (nip07Btn) {
  nip07Btn.addEventListener('click', async () => {
    nip07Btn.disabled = true;
    nip07Btn.textContent = 'CONNECTING…';
    const ok = await loginWithNip07();
    if (!ok) {
      toast('NIP-07 extension not found or denied', 'error');
      nip07Btn.disabled = false;
      nip07Btn.textContent = 'CONNECT EXTENSION';
    }
  });
}

/* ── nsec Login ── */
if (nsecLoginBtn) {
  nsecLoginBtn.addEventListener('click', () => {
    if (!nsecInput) return;
    const val = nsecInput.value;
    const result = loginWithNsec(val);
    /* Clear the input immediately regardless of outcome */
    nsecInput.value = '';
    if (result.ok) {
      toast('Logged in (ephemeral session)', 'success');
    } else {
      toast(`Error: ${result.error}`, 'error');
    }
  });
}

/* ── Logout (primary + secondary) ── */
function doLogout() {
  logout();
  if (_feedSub) { try { _feedSub.close(); } catch (_) {} _feedSub = null; }
  showView('landing');
  toast('Signed out. Key material cleared.', 'info');
}

if (logoutBtn)      logoutBtn.addEventListener('click',      doLogout);
if (logoutCallBtn)  logoutCallBtn.addEventListener('click',  doLogout);
if (logoutLogBtn)   logoutLogBtn.addEventListener('click',   doLogout);

/* ── Logo Navigation ── */
if (logoCall) {
  logoCall.setAttribute('tabindex', '0');
  logoCall.setAttribute('role', 'button');
  logoCall.setAttribute('aria-label', 'Go to CALL — compose notes');
  logoCall.addEventListener('click', () => enterCallView());
  logoCall.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') enterCallView(); });
}

if (logoLog) {
  logoLog.setAttribute('tabindex', '0');
  logoLog.setAttribute('role', 'button');
  logoLog.setAttribute('aria-label', 'Go to LOG — curate feed');
  logoLog.addEventListener('click', () => enterLogView());
  logoLog.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') enterLogView(); });
}

/* ── Back Buttons ── */
if (backFromCall) backFromCall.addEventListener('click', () => showView('landing'));
if (backFromLog)  backFromLog.addEventListener('click',  () => showView('landing'));

/* ── CALL View ── */

async function enterCallView() {
  showView('call');
  const { loggedIn, pubkey } = getAuthState();
  if (loggedIn && pubkey) {
    loadOwnNotes(pubkey);
  }
  refreshRelayList();
}

async function loadOwnNotes(pubkey) {
  if (!ownFeedList) return;
  ownFeedList.innerHTML = '';
  const loadingLi = document.createElement('li');
  loadingLi.className = 'feed-item feed-loading';
  loadingLi.textContent = 'LOADING NOTES…';
  ownFeedList.appendChild(loadingLi);

  try {
    const notes = await fetchOwnNotes(pubkey, 20);
    ownFeedList.innerHTML = '';
    if (!notes.length) {
      showEmptyState(ownFeedList, 'No notes yet. Be the first to PRINT one.');
      return;
    }
    for (const ev of notes) {
      upsertFeedItem(ownFeedList, ev, 'append');
    }
  } catch (err) {
    ownFeedList.innerHTML = '';
    showEmptyState(ownFeedList, 'Could not load notes.');
  }
}

/* Character counter */
if (callNoteInput && callCharCount) {
  callNoteInput.addEventListener('input', () => {
    const len = callNoteInput.value.length;
    callCharCount.textContent = `${len}/${NOTE_MAX_LEN}`;
    callCharCount.classList.toggle('warn', len > NOTE_MAX_LEN - 20);
  });
}

/* Publish */
if (publishBtn) {
  publishBtn.addEventListener('click', async () => {
    const { loggedIn } = getAuthState();
    if (!loggedIn) {
      toast('Please sign in first', 'error');
      return;
    }
    const content = callNoteInput ? callNoteInput.value.trim() : '';
    if (!content) {
      toast('Cannot publish an empty note', 'error');
      return;
    }
    publishBtn.disabled = true;
    publishBtn.textContent = 'PRINTING…';
    try {
      const eventTemplate = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content,
      };
      const signed = await signEvent(eventTemplate);
      const okRelays = await publishEvent(signed);
      if (okRelays.length > 0) {
        toast(`✓ PRINTED TO ${okRelays.length} RELAY${okRelays.length > 1 ? 'S' : ''}`, 'success');
        if (callNoteInput) callNoteInput.value = '';
        if (callCharCount) callCharCount.textContent = `0/${NOTE_MAX_LEN}`;
        /* Prepend to own feed */
        if (ownFeedList) {
          clearEmptyState(ownFeedList);
          upsertFeedItem(ownFeedList, signed, 'prepend');
        }
      } else {
        toast('Publish failed — check relay connections', 'error');
      }
    } catch (err) {
      toast(`Error: ${err.message}`, 'error');
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = 'PRINT';
    }
  });
}

/* ── LOG View ── */

async function enterLogView() {
  showView('log');
  const { loggedIn, pubkey } = getAuthState();
  if (loggedIn && pubkey) {
    /* Load follow list from relays */
    try {
      const saved = await fetchFollowList(pubkey);
      for (const pk of saved) {
        if (!_followedPubkeys.includes(pk)) {
          _followedPubkeys.push(pk);
          renderNewFollowChip(pk);
        }
      }
    } catch (_) { /* ignore */ }
    loadCuratedFeed();
  } else {
    loadCuratedFeed();
  }
  refreshRelayList();
}

function renderNewFollowChip(hexPk) {
  if (!followListEl) return;
  const chip = renderFollowChip(hexPk);
  chip.querySelector('button').addEventListener('click', () => {
    _followedPubkeys = _followedPubkeys.filter(p => p !== hexPk);
    chip.remove();
    refreshCuratedFeed();
  });
  followListEl.appendChild(chip);
}

if (addFollowBtn) {
  addFollowBtn.addEventListener('click', () => {
    const val = followInput ? followInput.value.trim() : '';
    if (!val) return;
    const result = decodeNpub(val);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    if (_followedPubkeys.includes(result.hex)) {
      toast('Already in list', 'info');
      return;
    }
    _followedPubkeys.push(result.hex);
    renderNewFollowChip(result.hex);
    if (followInput) followInput.value = '';
    refreshCuratedFeed();
    toast('Added to feed', 'success');
  });
}

/* Allow pressing Enter in follow input */
if (followInput) {
  followInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') addFollowBtn && addFollowBtn.click();
  });
}

async function loadCuratedFeed() {
  if (!curatedFeedList) return;
  /* Close previous subscription */
  if (_feedSub) { try { _feedSub.close(); } catch (_) {} _feedSub = null; }

  if (!_followedPubkeys.length) {
    curatedFeedList.innerHTML = '';
    showEmptyState(curatedFeedList, 'Add npubs above to curate your feed.');
    return;
  }

  curatedFeedList.innerHTML = '';
  const loadingLi = document.createElement('li');
  loadingLi.className = 'feed-item feed-loading';
  loadingLi.textContent = 'LOADING FEED…';
  curatedFeedList.appendChild(loadingLi);

  try {
    const notes = await fetchFeed(_followedPubkeys, 30);
    curatedFeedList.innerHTML = '';
    if (!notes.length) {
      showEmptyState(curatedFeedList, 'No notes found from followed npubs.');
    } else {
      for (const ev of notes) {
        upsertFeedItem(curatedFeedList, ev, 'append');
      }
    }
    /* Live subscription for new notes */
    _feedSub = subscribeToFeed(
      _followedPubkeys,
      ev => {
        clearEmptyState(curatedFeedList);
        upsertFeedItem(curatedFeedList, ev, 'prepend');
      }
    );
  } catch (err) {
    curatedFeedList.innerHTML = '';
    showEmptyState(curatedFeedList, 'Could not load feed.');
  }
}

function refreshCuratedFeed() {
  loadCuratedFeed();
}

/* Save NIP-51 list */
if (saveListBtn) {
  saveListBtn.addEventListener('click', async () => {
    const { loggedIn } = getAuthState();
    if (!loggedIn) { toast('Please sign in to save list', 'error'); return; }
    if (!_followedPubkeys.length) { toast('No npubs to save', 'info'); return; }
    saveListBtn.disabled = true;
    saveListBtn.textContent = 'SAVING…';
    try {
      await publishFollowList(_followedPubkeys, signEvent);
      toast('✓ LIST SAVED TO NOSTR (NIP-51)', 'success');
    } catch (err) {
      toast(`Error: ${err.message}`, 'error');
    } finally {
      saveListBtn.disabled = false;
      saveListBtn.textContent = 'SAVE LIST';
    }
  });
}

/* ── Relay Management ── */

function refreshRelayList() {
  const relays = getRelays();
  const status = {};
  if (relayCallList) renderRelayList(relayCallList, relays, status);
  if (relayLogList)  renderRelayList(relayLogList,  relays, status);
  /* Bind remove buttons */
  [relayCallList, relayLogList].forEach(listEl => {
    if (!listEl) return;
    listEl.querySelectorAll('[data-relay-url]').forEach(btn => {
      btn.addEventListener('click', () => {
        removeRelay(btn.dataset.relayUrl);
        refreshRelayList();
      });
    });
  });
}

function bindAddRelayBtn(inputEl, btnEl) {
  if (!btnEl || !inputEl) return;
  btnEl.addEventListener('click', () => {
    const url = inputEl.value.trim();
    if (!url) return;
    if (!url.startsWith('wss://')) {
      toast('Relay must use WSS (wss://)', 'error');
      return;
    }
    const added = addRelay(url);
    if (!added) { toast('Relay already added', 'info'); return; }
    inputEl.value = '';
    refreshRelayList();
    toast('Relay added', 'success');
  });
}

bindAddRelayBtn(addRelayCallInput, addRelayCallBtn);
bindAddRelayBtn(addRelayLogInput, addRelayLogBtn);

/* ── Collapsible relay sections ── */
document.querySelectorAll('.collapse-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const target = document.getElementById(targetId);
    if (!target) return;
    target.classList.toggle('open');
    btn.textContent = target.classList.contains('open') ? '▲ RELAYS' : '▼ RELAYS';
  });
});

/* ── Init ── */
(function init() {
  /* Start on landing */
  showView('landing');

  /* Detect NIP-07 and update auth UI immediately */
  updateAuthUI(getAuthState());

  /* Auto-login with NIP-07 if extension is present */
  if (window.nostr) {
    loginWithNip07().then(ok => {
      if (ok) toast('Signed in via extension', 'success');
    });
  }
})();
