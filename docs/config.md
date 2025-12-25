---
summary: 'SweetLink configuration reference covering sweetlink.json options, overrides, and precedence.'
---

# SweetLink Configuration Guide

SweetLink resolves its defaults from multiple sources (highest priority first):

1. CLI flags (`pnpm sweetlink ...`)
2. `sweetlink.json` / `sweetlink.config.json` in the current or parent directories
3. Environment variables (`SWEETLINK_*`)
4. Built-in defaults (assume a local app on `http://localhost:3000`)

This guide documents every supported key for the config file and environment overrides.

## Top-level Keys

| Key | Type | Description |
| --- | --- | --- |
| `appLabel` | string | Friendly display name used in CLI help, prompts, and diagnostics. CLI flag `--app-label` and `SWEETLINK_APP_LABEL` override it. |
| `appUrl` | string | Base URL SweetLink uses for development runs (`--env dev`). CLI flag `--app-url` overrides it. |
| `prodUrl` | string | Base URL for production runs (`--env prod`). Defaults to the same origin as `appUrl` unless `SWEETLINK_PROD_URL` or the config overrides it. |
| `daemonUrl` | string | SweetLink daemon origin (defaults to `https://localhost:4455`). CLI flag `--daemon-url` overrides it. |
| `adminKey` | string | Admin API key used for CLI token requests. Provide it via `--admin-key`, `SWEETLINK_LOCAL_ADMIN_API_KEY` (preferred), `SWEETLINK_ADMIN_API_KEY`, or the legacy `SWEETISTICS_*` variables. |
| `devBootstrap` | object | Optional dev bootstrap config that lets SweetLink fetch a local admin key + dev login URL automatically. |
| `port` | number | Convenience shortcut that rewrites the local `appUrl` port when `appUrl` itself is not specified. |
| `cookieMappings` | array | Additional host/origin pairs SweetLink should copy cookies for. See below for the schema. |
| `healthChecks.paths` | array | Extra HTTP paths (relative or absolute URLs) that SweetLink probes when checking server health. |
| `smokeRoutes.defaults` | array | Default route list for `pnpm sweetlink smoke`. |
| `smokeRoutes.presets` | object | Named route presets (e.g., `{ "admin": ["admin/users"] }`). |
| `redirects` | object | Explicit path-to-path redirects SweetLink treats as success during navigation (e.g., `{ "/": "/timeline" }`). |
| `oauthScript` | string | Path to an ESM module exporting `authorize(context)` for OAuth auto-approval. CLI flag `--oauth-script` overrides it. |
| `servers` | array | Optional commands that start/check your local server per environment (`dev`, `prod`, ...). |

### `cookieMappings`

Each entry provides two arrays:

```json
{
  "cookieMappings": [
    {
      "hosts": ["example.dev", "*.example.dev"],
      "origins": [
        "https://example.dev",
        "https://api.example.dev"
      ]
    }
  ]
}
```

- `hosts` may contain exact domains or leading-wildcard entries (`*.example.dev`).
- `origins` must be fully qualified URLs.

### `servers`

Use `servers` to let SweetLink start or probe your dev stack when it’s offline. Each item has this shape:

```json
{
  "servers": [
    {
      "env": "dev",
      "start": ["pnpm", "run", "dev"],
      "check": ["curl", "--fail", "http://localhost:3000/api/health"],
      "timeoutMs": 45000,
      "cwd": "."
    }
  ]
}
```

- `env` (string, required) – Matches the CLI environment (`dev`, `prod`, ...). SweetLink picks the entry whose `env` equals the current run.
- `start` (array of strings, optional) – Command to launch your app. SweetLink spawns it detached (no output unless `SWEETLINK_DEBUG=1`).
- `check` (array of strings, optional) – Command that returns `0` when the server is ready. If omitted, SweetLink falls back to HTTP `HEAD` probes using `appUrl` and `healthChecks.paths`.
- `cwd` (string, optional) – Working directory for both commands (defaults to the directory containing `sweetlink.json`).
- `timeoutMs` (number, optional) – How long to wait for the server to become healthy after running the start command. Defaults to 30000 (30 seconds).

If `servers` is omitted, SweetLink still pings `appUrl`/`healthChecks.paths` but it will not try to start the stack automatically.

### `devBootstrap`

Use `devBootstrap` to point SweetLink at a local endpoint that mints a short-lived admin API key and provides a dev-login URL. This is most useful when your dev environment has no admin cookies yet.

```json
{
  "devBootstrap": {
    "path": "/api/admin/sweetlink/bootstrap",
    "loginPath": "/auth/signin?dev=1&sweetlink=auto",
    "redirectParam": "redirect"
  }
}
```

- `path` (string, required) – API endpoint SweetLink will POST to when it needs a dev admin key. The response should include `adminApiKey` and optionally `loginPath`.
- `loginPath` (string, optional) – Default login URL SweetLink can open before deep-linking (overridden by the API response if provided).
- `redirectParam` (string, optional) – Query param name used to pass the target path (defaults to `redirect`).

### `oauthScript`

This path points at an ESM module that exports `authorize(context)`. SweetLink loads the module at runtime and delegates OAuth approval to it. The context exposes:

- `devtoolsUrl` – Chrome DevTools endpoint
- `sessionUrl` – Target SweetLink session URL
- `fetchTabs`, `evaluateInDevToolsTab` – Helpers for DevTools automation
- `connectPuppeteer`, `resolvePuppeteerPage`, `waitForPageReady` – Puppeteer helpers

See `apps/sweetlink/examples/oauth/twitter-oauth-automation.ts` for a full example.

## Environment Variables

Environment variables override config entries. Key ones include:

- `SWEETLINK_APP_LABEL`, `SWEETLINK_APP_URL`, `SWEETLINK_DAEMON_URL`, `SWEETLINK_PROD_URL`
- `SWEETLINK_OAUTH_SCRIPT`
- `SWEETLINK_CA_PATH`, `SWEETLINK_CAROOT`
- `SWEETLINK_DEBUG=1` (verbose logging)

## Configuration Precedence

When multiple sources provide a value, SweetLink applies this order:

CLI flag → Config file → Environment variable → Built-in default.

For example, `--oauth-script ./custom.ts` beats `sweetlink.json`’s `oauthScript`, which beats `SWEETLINK_OAUTH_SCRIPT`, which beats the hard-coded default (disabled).

## Related Docs

- `apps/sweetlink/README.md` – End-user CLI guide, including smoke tests and examples.
- `docs/cli/sweetlink.md` – Pointer to the canonical README.
- `apps/sweetlink/examples/oauth/twitter-oauth-automation.ts` – OAuth automation script template.
- `redirects` — Optional object mapping source paths to their expected destination paths. SweetLink applies these rules when verifying smoke-test routes and DevTools navigations, so if your app immediately redirects `/` to `/timeline`, add `{ "/": "/timeline" }` to avoid false failures. Paths are normalized (leading slash, trailing slash trimmed) before comparison, and query parameters aren’t part of the rule.
