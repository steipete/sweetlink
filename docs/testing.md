---
summary: Running log of SweetLink test coverage improvements and pending work.
---

# Testing Progress Log

## Local gates

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` from the repository root. The root Vitest suite includes `daemon/tests`, and token-cache tests provide their own secret fixture before importing the shared environment.

`pnpm --dir daemon test` runs only the daemon tests through that same Vitest configuration. `pnpm --dir daemon build` uses the root build, which owns the published daemon entrypoint at `dist/daemon/src/index.js`. The shared package and demo also have build checks: `pnpm --dir shared build` and `pnpm --dir examples/basic-web build`.

## Coverage Snapshot (Nov 8, 2025)
- Statements: 80.2 % (2 150 / 2 682) per `pnpm --filter sweetlink exec vitest run --coverage`.
- Branches: 66.5 % (1 339 / 2 014) with the remaining gaps concentrated in the cookie collector + DevTools registry helpers.
- Current exclusions: CLI entrypoint `src/index.ts` and all example scaffolding under `examples/**` (configured in `vitest.config.ts`) so we report only unit-testable product code.

## Recent Additions
- **Chrome diagnostics & HTTP plumbing** – `tests/runtime/chrome/diagnostics.test.ts` now covers cookie origin fallbacks and readiness paths, while `tests/http.test.ts` exercises the safe JSON fallback + cause serialization so fetch errors stay actionable.
- **OAuth automation seams** – `tests/runtime/devtools-oauth.test.ts` covers function/default exports, invalid handler results, and connect-Puppeteer failure logging; new fixtures live under `tests/fixtures/*-oauth-handler.*`.
- **DevTools surface area** – Expanded `tests/devtools-diagnostics.test.ts` + `tests/runtime/devtools-cdp.test.ts` to cover tab discovery/retry, CDP fetch sanitizers, and console/network serialization. `tests/runtime/devtools-background.test.ts` now asserts child-process warnings, PID cleanup, and ENOENT/EACCES handling.
- **Session bootstrap** – `tests/runtime/chrome/session.test.ts` exercises `signalSweetLinkBootstrap` alongside the existing polling loop so bootstrap failures log with context.
- **Docs** – This file tracks the push so future engineers know the exact suite + focus areas that lifted us over the 80 % bar.

## Next Targets
1. **`src/runtime/cookies.ts` (~67 % statements)** – The collector/normalizer logic still dominates the red cells. Next push should target `collectChromeCookiesForDomains`, `pruneIncompatibleCookies`, and the `normalizeSameSite` / re-homing branches.
2. **`src/devtools-registry.ts` (~67 %)** – Need deterministic tests for malformed DevTools URLs, socket timeouts, and lingering Chrome sweeps so cleanup logic is trustworthy.
3. **`src/runtime/screenshot.ts` (~73 %)** – The DevTools capture/HTML fallback paths still lack failure-mode coverage (selector miss, prompt suppression, and RT debug logging). Covering those branches should also raise branch coverage past 70 %.

Log updated after landing the November 8 coverage push.

Log updated after landing the November 8 coverage push.
