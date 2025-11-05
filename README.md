# SweetLink

**Connect your agent to your web app. Like Playwright, but works in your current tab. Close the loop.**

SweetLink gives automation agents a first-class handle on the browser you already have open. Instead of spinning up a throwaway headless session, SweetLink attaches to a controlled Chrome window, keeps tabs alive across commands, and lets you drive interactive workflows (OAuth, dashboards, screenshot capture) from the same session your team is debugging.

## What you get

- **Foreground-friendly automation** – launch or reuse a controlled Chrome window, bring it to the front, and keep using the exact tab your agent navigates.
- **Session intelligence** – inspect buffered console logs, network events, screenshots, and Bootstrap diagnostics whenever something fails to register.
- **Composable CLI** – one command (`pnpm sweetlink`) powers navigation, scripted clicks, JS execution, screenshots, and smoke flows.
- **Agent-friendly APIs** – JSON first output, deterministic exit codes, and hooks you can call from any orchestrator.

## Quick start

```bash
# Install dependencies
pnpm install

# List the built-in commands
pnpm sweetlink --help

# Launch or reuse a controlled Chrome session in the foreground
pnpm sweetlink open --controlled --path timeline/home --foreground

# Capture a screenshot with fatal selector detection
pnpm sweetlink screenshot greasy-teenager --selector '[data-sweetlink-target="timeline-activity-card"]'
```

SweetLink expects a controlled Chrome window that exposes the DevTools protocol. The `open --controlled` command spins one up on demand, syncs cookies from your main profile (unless disabled), and registers the session with the daemon so follow-up commands reuse the same tab.

## Agent integration tips

- Track active sessions with `pnpm sweetlink sessions --json`, then feed the codename back into your agent’s action loop.
- Use `--foreground` when you want SweetLink to bring Chrome to the front after each launch/reuse. (This calls `page.bringToFront()` under the hood—no AppleScript hacks required.)
- Automate screenshot capture via `pnpm sweetlink screenshot <session> --selector ... --wait-visible` and inspect failures with the DevTools diagnostics dump that the CLI emits on timeout.
- For smoke testing existing routes, `pnpm sweetlink smoke --routes main` walks the core app paths and reports console/network failures.

## Repository layout

- `src/` – CLI entry point, command implementations, runtime helpers.
- `shared/` – cross-project utilities shared with the daemon and standalone clients.
- `daemon/` – optional background service that keeps controlled Chrome instances registered and streams DevTools buffers.
- `tests/` – Vitest suites covering runtime helpers, diagnostics logging, and CLI ergonomics.
- `examples/` – minimal web app demonstrating how to register a browser client with the local daemon.

## Development

```bash
# Run unit tests
pnpm test

# Lint (Biome + ESLint + oxlint) the touched files
pnpm run lint

# Build distributable artifacts
pnpm --filter @sweetistics/sweetlink run build
```

SweetLink ships as a pure ESM workspace. Use Node 20+ with Corepack-enabled pnpm to guarantee matching tooling versions.

## License

SweetLink inherits the Sweetistics monorepo license. See [LICENSE](./LICENSE) for details.
