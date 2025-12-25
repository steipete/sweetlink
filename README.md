# SweetLink 🍭 - Playwright vibes in your current tab; close the agent loop

<p align="center">
  <img src="docs/assets/sweetlink-header.png" alt="SweetLink header banner" width="1100">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sweetlink"><img src="https://img.shields.io/npm/v/sweetlink?style=for-the-badge&logo=npm&logoColor=white" alt="npm version"></a>
  <a href="https://github.com/steipete/sweetlink/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/steipete/sweetlink/ci.yml?branch=main&style=for-the-badge&label=tests" alt="CI Status"></a>
  <a href="https://github.com/steipete/sweetlink"><img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-blue?style=for-the-badge" alt="Platforms"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="MIT License"></a>
</p>

SweetLink is the agent-ready way to "connect your agent to your web app. Like Playwright, but it works in your current tab. Close the loop." It drives a real browser session through the SweetLink daemon so you can authenticate, capture screenshots, run smoke tests, and gather DevTools telemetry without wiring up a headless automation stack.

## Features

- **Session management** – list active sessions, inspect console/network buffers, and reconnect after hot reloads.
- **Controlled Chrome launch** – spin up a DevTools-enabled browser, sync cookies from your main profile, and auto-approve the Twitter OAuth consent flow.
- **Smoke tests** – sweep configurable route presets (dashboard, reports, search, billing, settings) and flag authentication or runtime errors.
- **Screenshots & selectors** – capture JPEGs via Puppeteer/HTML renderers and discover DOM selectors for automation.
- **DevTools telemetry** – stream console/network logs to disk, dump diagnostics when a session fails to register, call Next.js DevTools (`/_next/mcp`) for structured error summaries, and click the OAuth authorize button on demand.

## Prerequisites

- Node.js 22+
- `pnpm` (managed via Corepack)
- TLS requirements: `brew install mkcert nss`
- SweetLink daemon running locally (`pnpm exec sweetlink daemon` or `pnpm exec sweetlinkd`)
- Trust the local certificate once: `pnpm sweetlink trust-ca`

## Installation

```bash
pnpm install
pnpm run build
```

> Working from the Sweetistics monorepo? Follow the workspace-specific guide in `docs/cli/sweetlink.md` instead of this README.

## Usage

```bash
pnpm sweetlink --help
```

Common workflows:

- `pnpm exec sweetlink daemon` – start the SweetLink daemon (alias: `pnpm exec sweetlinkd`).
- `pnpm sweetlink open --controlled --path /dashboard` – launch/reuse the controlled Chrome window.
- `pnpm sweetlink open --url http://localhost:4100/dashboard` – target a non-default host/port for one-off runs.
- `pnpm sweetlink sessions` – view active sessions (codename, heartbeat, socket state, buffered console errors).
- `pnpm sweetlink smoke --routes main` – sweep the configured dashboard/search/settings routes.
- `pnpm sweetlink devtools authorize` – force-click the OAuth consent button when Twitter prompts.

When a session fails to register, the CLI now emits a DevTools snapshot and Puppeteer scrape (overlay/body text) so build/runtime errors surface immediately.

#### Timeouts & readiness

Every `sweetlink open` waits until one of three things happens:

1. The controlled tab re-registers with the daemon (happy path).
2. The page reports it has finished loading but SweetLink still isn’t online, in which case we dump DevTools + Next.js diagnostics immediately.
3. The command exceeds `--timeout` seconds (default `45`) and bails with the same diagnostics. Increase `--timeout <seconds>` if you intentionally run on a slow dev stack.

Because the readiness check follows the page rather than a fixed delay, healthy sessions attach quickly while failures are surfaced within the configured timeout window.

#### Next.js DevTools errors

If the target app exposes the Next.js MCP endpoint (the default for `pnpm next dev`), SweetLink automatically calls `/_next/mcp` → `get_errors` whenever a navigation looks suspicious. The CLI prints the same markdown summary you would see in the Next.js overlay—complete with source-mapped stack traces—then falls back to the existing overlay/Puppeteer scraping for non-Next projects. No extra configuration is required as long as `next-devtools` is registered in `config/mcporter.json` (it is by default in the Sweetistics repo).

### TLS onboarding

SweetLink defaults to `https://localhost:4455` for daemon traffic. Run `pnpm sweetlink trust-ca` once per machine to install the mkcert certificate authority, then open `https://localhost:4455` in the browser profile you plan to automate and accept the prompt. The demo app surfaces a “Daemon TLS” banner—if it shows “not trusted,” click “Open Daemon Certificate,” accept the warning, then hit “Retry Check” before enabling SweetLink.

**Heads-up:** the daemon reuses the same certificate/key stored in `~/.sweetlink/certs`, but browsers remember trust decisions per profile. The first time a profile (or a remote-debugging instance) hits `https://localhost:4455`, expect one warning screen—accept it once and the profile stays trusted.

## Architecture

SweetLink consists of two cooperating pieces:

- **CLI** – a Node.js client that parses your commands (`open`, `smoke`, `sessions`, etc.), reads `sweetlink.json`, and establishes a control session with your browser.
- **Daemon** – a long-lived service (`pnpm exec sweetlink daemon` or `pnpm exec sweetlinkd`) that launches or attaches to a DevTools-enabled Chrome instance, forwards console/network telemetry, and executes remote evaluations on behalf of the CLI.

The typical flow looks like this:

1. You start the daemon once per workstation. It spins up (or reconnects to) Chromium with the remote debugging port exposed and registers a secure WebSocket endpoint.
2. Running `pnpm sweetlink open --controlled` prompts the CLI to locate `sweetlink.json`, resolve runtime defaults (hosts, smoke routes, OAuth automation scripts), and request a session token from the daemon using your admin key.
3. The daemon launches the controlled browser window (or reuses the existing one), hydrates it with cookies from your configured `cookieMappings`, and signals the CLI when the target page is healthy (`healthChecks.paths` + optional `servers` checks).
4. Commands like `sweetlink smoke` or `sweetlink devtools authorize` stream instructions to the daemon. The daemon executes them via DevTools Protocol or Puppeteer, shipping back console output, screenshots, and failure diagnostics in real time.
5. When the CLI exits, the daemon keeps the browser alive so the next command can reuse the authenticated context; run `pnpm sweetlink sessions` to inspect or detach lingering sessions.

Because the CLI and daemon communicate over secure WebSockets, you can run the daemon locally or on a remote VM. Set `daemonUrl` in `sweetlink.json` (or `SWEETLINK_DAEMON_URL`) to tunnel to the remote instance, while keeping the same CLI workflows.

## Configuration

### Generic usage

SweetLink resolves defaults from (highest priority first):

1. CLI flags (e.g. `--url`, `--app-url`, `--daemon-url`, `--port`)
2. `sweetlink.json` (or `sweetlink.config.json`) located in or above the current working directory (SweetLink walks up parent directories until it finds one)
3. Environment variables (`SWEETLINK_APP_URL`, `SWEETLINK_DAEMON_URL`, `SWEETLINK_PROD_URL`)
4. Fallback `http://localhost:3000`

Start by copying `sweetlink.example.json` from the repo root. It ships with a neutral baseline config:

```json
{
  "appUrl": "http://localhost:4100",
  "prodUrl": "https://demo.acme.app",
  "daemonUrl": "https://localhost:4455",
  "port": 4100,
  "healthChecks": {
    "paths": ["/api/health"]
  },
  "cookieMappings": [
    {
      "hosts": ["example.dev", "*.example.dev", "localhost", "127.0.0.1"],
      "origins": [
        "https://app.example.dev",
        "https://auth.example.dev",
        "https://api.example.dev"
      ]
    }
  ]
}
```

Place the config file in your project root (or any parent directory). With the file in place, `pnpm sweetlink open --controlled --foreground` will automatically point at `http://localhost:4100` unless an explicit `--url`/`--app-url` is provided. The CLI also exposes `--port` to temporarily rewrite the local host port without editing the JSON file. `healthChecks.paths` lets you point the readiness probe at specific endpoints (for example `/api/health`). `cookieMappings` declares extra origins to harvest cookies from (such as OAuth provider cookies when you reuse a signed-in Chrome profile). `smokeRoutes.defaults` overrides the built-in route sweep, and `smokeRoutes.presets` lets you register new comma-delimited shortcuts (the built-ins `main`, `settings`, `billing-only`, and `pulse-only` remain available). Hosts accept plain domains or wildcard-prefixed entries (`*.example.dev`), and origins must be fully-qualified URLs. Omit `daemonUrl`, `prodUrl`, `healthChecks`, `smokeRoutes`, or `cookieMappings` to keep SweetLink’s defaults for those targets.

- Update any `pnpm --filter` commands, tmux helpers, or scripts that referenced the old scope (for example `pnpm --filter sweetlink run build`).
- Prefer the new environment variables for admin keys: `SWEETLINK_LOCAL_ADMIN_API_KEY` (dev shells) and `SWEETLINK_ADMIN_API_KEY` (prod shells). Legacy `SWEETISTICS_*` vars continue to work, but plan to remove them once every integration is updated.
- Copy the neutral `sweetlink.example.json` from the repo root when onboarding SweetLink into another project so you start from generic hostnames/domains instead of the monorepo’s internal defaults.

### Config keys at a glance

- `appLabel` – Friendly display name used in CLI help, prompts, and error messages. Set it via config, `--app-label`, or the `SWEETLINK_APP_LABEL` env; defaults to “your application”.
- `appUrl` – Default URL SweetLink opens in dev mode. Pair it with `port` when your local server is not on 3000. CLI flags (`--url`, `--app-url`) or `SWEETLINK_APP_URL` override it.
- `prodUrl` – Base URL for `--env prod` runs (smoke tests, screenshots). Falls back to the same origin as `appUrl` when omitted or when `SWEETLINK_PROD_URL` is unset.
- `daemonUrl` – Location of the SweetLink daemon. Defaults to `https://localhost:4455`; override when you run the daemon remotely.
- `adminKey` – Admin API key used when the CLI requests short-lived session tokens. Provide it via config/`--admin-key`, `SWEETLINK_LOCAL_ADMIN_API_KEY` (preferred for dev), `SWEETLINK_ADMIN_API_KEY` (prod), or the legacy `SWEETISTICS_*` variables for backwards compatibility.
- `devBootstrap` – Optional dev bootstrap settings that let the CLI fetch a local admin key + dev login URL on demand (endpoint + login path).
- `port` – Injected into `appUrl` when no explicit host is provided. Handy for per-service configs (`4100`, `5173`, etc.).
- `healthChecks.paths` – Additional paths the CLI and watchdog probe before assuming the app is healthy. Include JSON APIs or custom `/healthz` endpoints to catch silent failures.
- `cookieMappings` – List of `{ hosts, origins }` entries that teach SweetLink which Chrome profiles to harvest cookies from. Map every hostname your app serves (including wildcards) to the origins you need (auth providers, REST APIs, CDNs). SweetLink combines these with the primary origin for the target URL; no extra domains are assumed automatically.
- `smokeRoutes.defaults` – Ordered array of routes visited by `pnpm sweetlink smoke`. Include additional views or dashboards specific to your app.
- `smokeRoutes.presets` – Named presets (`{ "admin": ["admin/users", "admin/settings"] }`) that become `pnpm sweetlink smoke --routes admin`.
- `servers` – Optional list of commands that start/check your local server per environment. Useful when you want SweetLink to boot your app automatically before running automation.
- `oauthScript` – Absolute or relative path to an OAuth automation script (ESM module). When set, SweetLink loads the module at runtime and calls its `authorize(context)` export to approve third-party consent dialogs.

SweetLink reads the config once at start-up. When you edit `sweetlink.json` rerun the CLI command to pick up the new defaults. Multiple projects on the same machine can keep their own config files; SweetLink stops at the first file it finds while walking up the directory tree, so place project-specific configs as close to the repo root as possible.
See `apps/sweetlink/docs/config.md` for a full configuration reference (including environment overrides).

### OAuth automation scripts

Out of the box SweetLink no longer ships opinionated OAuth heuristics. Instead you can point `oauthScript` at a small ESM module that exports an `authorize(context)` function. The helper receives a `SweetLinkOauthAuthorizeContext` with DevTools and Puppeteer helpers, so you can fully control how SweetLink approves third-party consent prompts. A ready-to-use implementation for Twitter/X lives at `apps/sweetlink/examples/oauth/twitter-oauth-automation.ts`; copy it into your project (or tweak it) and set `oauthScript` to that path to re-enable the previous behaviour. If the script is omitted, SweetLink will log that auto-authorization is disabled and leave the prompt untouched.

You can also specify the script through runtime inputs:

- CLI flag: `pnpm sweetlink open --controlled --oauth-script ./path/to/oauth-handler.ts`
- Environment variable: `SWEETLINK_OAUTH_SCRIPT=./path/to/oauth-handler.ts pnpm sweetlink open --controlled …`

SweetLink resolves paths relative to the current working directory (or uses absolute paths unchanged). Configuration order still applies: CLI flag → config file `oauthScript` → `SWEETLINK_OAUTH_SCRIPT` env → disabled.

Each automation module must export a single async function:

```ts
import type { SweetLinkOauthAutomation } from 'sweetlink';

const automation: SweetLinkOauthAutomation = {
  async authorize(context) {
    // use context.fetchTabs / context.evaluateInDevToolsTab / context.connectPuppeteer
    // to locate and click the consent button
    return { handled: false, reason: 'button-not-found' };
  },
};

export default automation;
```

See the Twitter example for a complete script that works with X’s current consent UI (stacked DOM selectors, login fallback detection, Puppeteer retries).

## Browser Runtime API

SweetLink’s browser client is now a first-class export. Instead of copying 1,500+ lines of glue from the Sweetistics repo, pull in the runtime directly:

```ts
import {
  createSessionStorageAdapter,
  createSweetLinkClient,
} from 'sweetlink/runtime/browser';

const storage = createSessionStorageAdapter();

export const sweetLinkClient = createSweetLinkClient({
  storage,
  status: {
    onStatusSnapshot: (snapshot) => setSweetLinkStatus(snapshot),
  },
  autoReconnectHandshake: () => fetch('/api/admin/sweetlink/remote-handshake', { method: 'POST' }).then((res) => res.json()),
});
```

The runtime mirrors everything we ship in production: websocket lifecycle, console buffering, screenshot hooks/renderers, selector discovery, and auto-reconnect with stored-session resume. Tests can import `sweetLinkBrowserTestHelpers` to reuse `createHookRunner`, `stripDataUrlPrefix`, and `commandSelectorSummary` without reaching into private modules.

👉 See [`apps/sweetlink/browser.md`](./browser.md) for a step-by-step integration guide (handshake endpoint, custom storage adapters, DOM events) plus a reference implementation you can copy into other apps.

## Example App

Looking for a minimal integration? Launch the demo web app under `apps/sweetlink/examples/basic-web`:

```bash
cd examples/basic-web
pnpm dev
```

The Vite dev server auto-reloads whenever you tweak the example UI. The site exposes a single page with an “Enable SweetLink” button. Clicking it calls the included `/api/sweetlink/handshake` route, registers with your locally running daemon, and keeps the socket alive so you can attach via `pnpm sweetlink console demo`. The example bundles a small browser client that handles the `register`, `heartbeat`, and `runScript` command flow so you can verify end-to-end behaviour without touching your production app. A status chip at the top of the page shows the active SweetLink codename so developers can confirm which CLI session is currently linked.

Once attached, experiment with commands such as:

1. `pnpm sweetlink run-js demo --code "demo.updateKpi(87)"` – change the KPI badge value.
2. `pnpm sweetlink run-js demo --code "demo.toggleBadge()"` – flip the feature badge between `beta` and `stable`.
3. `pnpm sweetlink screenshot demo --selector "#screenshot-card"` – capture the pre-styled analytics card.

*Tip:* Every time you use a copy icon, the demo logs a “Copied … command” entry in the status panel. Tail them from the CLI via `pnpm sweetlink devtools console --tail 50` to confirm clipboard-driven workflows are firing.

Scroll further down to the **Automation prompt library** for ready-to-paste prompts you can drop into Codex, Claude, or Cursor once a session is live.


Keep watching the status log (and DevTools tail) while you automate—the demo surfaces every clipboard copy, handshake, and CLI action there so you know exactly what ran.

## Local Checks

```bash
pnpm lint
pnpm test
```

## License

SweetLink (CLI, daemon, and shared packages) is licensed under the MIT License. See `apps/sweetlink/LICENSE` for the full text.

## TLS Onboarding

SweetLink’s daemon defaults to `https://localhost:4455`. Run `pnpm sweetlink trust-ca` once per machine to install the mkcert certificate authority, then visit `https://localhost:4455` in the browser profile you plan to automate and accept the prompt. The example app (run `pnpm dev` inside `examples/basic-web`) now performs a preflight check via `/api/sweetlink/status`: it blocks the “Enable SweetLink” button until the daemon is reachable and the certificate is trusted, with quick actions to open the daemon URL or retry the check.

When automating, you can poll `/api/sweetlink/status` the same way—only proceed when `reachable` and `tlsTrusted` are both true.
