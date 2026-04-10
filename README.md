# CALL.LOG

> Ephemeral retro receipt-style Nostr client — write notes (CALL) and curate feeds (LOG)

```
  * * * NOSTR CLIENT * * *
  -------------------------
   C A L L . L O G
  -------------------------
  ephemeral · nostr · receipt
```

## Overview

**CALL.LOG** is a fully static, zero-backend web app for interacting with the [Nostr](https://nostr.com) protocol. It has a thermal-printer / receipt aesthetic and is mobile-first. No server, no database, no tracking.

- **CALL** → Compose & publish kind 1 text notes to Nostr relays
- **LOG** → Curate a feed of notes from followed npubs (stored as a NIP-51 people list on Nostr itself)

## Features

| Feature | Details |
|---------|---------|
| 🔐 NIP-07 signing | Use Alby, nos2x or any browser extension — private key never touches the app |
| 🔑 Ephemeral nsec | Fallback: paste your nsec (held in memory only, never persisted) |
| ✍️ Compose notes | Write & publish kind 1 text notes (NIP-01) |
| 📋 Feed curation | Follow npubs, read their notes in a receipt-style feed |
| 📌 NIP-51 lists | Save/load your follow list as a kind 30000 event on Nostr |
| 🖨️ Receipt UI | Monospace font, torn paper edges, amber/green terminal glow |
| 🌙 Dark mode | "Carbon copy" dark theme via `prefers-color-scheme` |
| 📱 PWA-ready | Add to home screen on mobile |

## Security

- **No localStorage, no cookies, no IndexedDB** for sensitive data
- Private keys are held only in JavaScript memory and cleared on logout/refresh
- All relay connections use **WSS** (secure WebSockets) only
- Content Security Policy meta tag restricts script/connect sources
- nsec input field uses `type="password"` — value is never logged

## Tech Stack

- **Pure HTML/CSS/JavaScript** — no framework, no build step
- [`nostr-tools`](https://github.com/nbd-wtf/nostr-tools) v2 loaded via [esm.sh](https://esm.sh) CDN
- Fully static — host on GitHub Pages, Netlify, Cloudflare Pages, etc.

## File Structure

```
calllog/
├── index.html          # Entry point — landing page + all views
├── manifest.json       # PWA manifest
├── css/
│   └── style.css       # Receipt theme, animations, responsive CSS
├── js/
│   ├── app.js          # Routing, view management, event wiring
│   ├── nostr.js        # Relay pool, publish, subscribe, NIP-19/51
│   ├── auth.js         # NIP-07 detection, ephemeral nsec, sign/logout
│   └── ui.js           # Receipt rendering, toasts, typewriter effect
└── README.md
```

## Default Relays

- `wss://relay.damus.io`
- `wss://relay.nostr.band`
- `wss://nos.lol`
- `wss://relay.snort.social`

You can add or remove relays in-app (stored in memory only for the session).

## Setup & Usage

1. Clone or download this repository
2. Serve the files with any static file server, e.g.:
   ```bash
   npx serve .
   # or
   python3 -m http.server 8080
   ```
3. Open `http://localhost:8080` in your browser
4. Click **CALL** to write notes, **LOG** to curate feeds

> **Tip:** Install the [Alby browser extension](https://getalby.com) or [nos2x](https://github.com/fiatjaf/nos2x) for NIP-07 signing — your private key never leaves your extension.

## Hosting (GitHub Pages)

1. Push to a `gh-pages` branch (or use the `main` branch with Pages enabled)
2. Set GitHub Pages source to the repo root
3. Access at `https://<username>.github.io/calllog/`

## License

MIT
