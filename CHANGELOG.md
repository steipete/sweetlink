# Changelog

## 0.2.2 — 2026-08-10

**Highlight:** `sweetlinkd --help` no longer starts the daemon, and this
release clears seven security advisories — the vulnerable undici 7.28.0 leaves
the dependency graph entirely.

### Fixes

- **Standalone daemon help fixed**: `sweetlinkd --help` now prints usage and exits instead of starting the daemon.
- **Example handshake fixed**: the basic web example now converts HTTP daemon origins to browser-compatible WebSocket URLs and permits the configured socket origin plus SweetLink command modules through its content security policy.

### Security and maintenance

- Refresh the dependency graph, clearing seven advisories: vulnerable `undici` 7.28.0 is removed entirely, and playwright-core, puppeteer-core, jsdom 30, ws, and the oxc toolchain move to current releases.

## 0.2.1 — 2026-06-11

- **Click defaults restored**: `sweetlink click` now scrolls targets into view and dispatches bubbling clicks by default again, with explicit `--no-scroll` and `--no-bubbles` opt-outs. Thanks @devYRPauli.
- **Cookie collection modernized**: Chrome cookie sync now uses `@steipete/sweet-cookie`, preserves the `~/.oracle` inline fallback, and drops the old native SQLite/keytar dependency path.
- **Smoke route corrected**: the built-in `main` preset now targets `/timeline` and no longer treats the removed `/timeline/home` route as equivalent.
- **Node 24 baseline**: package metadata, CI, TypeScript builds, linting, and runtime dependencies now target Node.js 24 or newer.
- **Runtime maintenance**: updated Commander, Puppeteer Core, Playwright Core, WebSocket, Vite, and supporting dependencies.

## 0.2.0 — 2025-12-26

- **Browser runtime tests moved in**: migrated Sweetistics runtime/browser test coverage into SweetLink’s own suite.
- **JSDOM-backed runtime specs**: added `jsdom` dev dependency to support browser runtime tests.
- **DevTools cleanup**: removed an unused DevTools CDP import to keep lint noise down.
- **OAuth deep linking**: `sweetlink open` now auto-kicks OAuth and re-navigates to deep paths when a sign-in flow is required.
- **Cookie sync stability**: Chrome cookie harvesting runs sequentially to avoid dropped reads; added regression coverage.
- **Daemon entrypoints**: added the `sweetlinkd` bin plus `sweetlink daemon` subcommand for daemon starts.
- **Reuse fallback**: when a reused DevTools session fails to reach the deep link, `sweetlink open` now launches a fresh controlled window and retries.
- **Daemon shared resolution**: `sweetlinkd` now loads shared helpers via bundled paths so local installs and links run cleanly.
- **Dev bootstrap**: optional `devBootstrap.path` can mint a local admin API key + dev login URL for Sweetistics.

## 0.1.0 — 2025-11-22 (Initial release)

### Highlights
- **Agent-ready CLI + daemon** to drive a controlled Chrome window, reuse an authenticated tab, stream DevTools telemetry, and reconnect after hot reloads.
- **Session & smoke automation**: `open`, `sessions`, and `smoke --routes` commands with configurable route presets, readiness-based timeouts, and console/network buffering.
- **Diagnostics-first runs**: Next.js MCP (`/_next/mcp`) error summaries with source-mapped stacks, overlay/Puppeteer fallbacks, cookie priming, and TLS health checks so failures surface immediately.
- **Screenshots & selectors**: JPEG capture via Puppeteer/HTML renderer plus selector discovery helpers for downstream automation.
- **OAuth & TLS helpers**: pluggable OAuth automation script hook (Twitter example) and `sweetlink trust-ca` to install the mkcert CA for daemon HTTPS.
- **Browser runtime export**: `sweetlink/runtime/browser` for in-app clients (status callbacks, reconnect, storage adapters), demonstrated by the bundled demo app with live session indicator.
- **Config & docs**: project-walking `sweetlink.json` with env overrides, neutral example config, MIT license, and refreshed README/browser guide.
