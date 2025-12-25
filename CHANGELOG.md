# Changelog

## 0.1.1 — Unreleased

- **Browser runtime tests moved in**: migrated Sweetistics runtime/browser test coverage into SweetLink’s own suite.
- **JSDOM-backed runtime specs**: added `jsdom` dev dependency to support browser runtime tests.
- **DevTools cleanup**: removed an unused DevTools CDP import to keep lint noise down.

## 0.1.0 — 2025-11-22 (Initial release)

### Highlights
- **Agent-ready CLI + daemon** to drive a controlled Chrome window, reuse an authenticated tab, stream DevTools telemetry, and reconnect after hot reloads.
- **Session & smoke automation**: `open`, `sessions`, and `smoke --routes` commands with configurable route presets, readiness-based timeouts, and console/network buffering.
- **Diagnostics-first runs**: Next.js MCP (`/_next/mcp`) error summaries with source-mapped stacks, overlay/Puppeteer fallbacks, cookie priming, and TLS health checks so failures surface immediately.
- **Screenshots & selectors**: JPEG capture via Puppeteer/HTML renderer plus selector discovery helpers for downstream automation.
- **OAuth & TLS helpers**: pluggable OAuth automation script hook (Twitter example) and `sweetlink trust-ca` to install the mkcert CA for daemon HTTPS.
- **Browser runtime export**: `sweetlink/runtime/browser` for in-app clients (status callbacks, reconnect, storage adapters), demonstrated by the bundled demo app with live session indicator.
- **Config & docs**: project-walking `sweetlink.json` with env overrides, neutral example config, MIT license, and refreshed README/browser guide.
