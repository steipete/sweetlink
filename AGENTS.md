# Repository Guidelines

## Shared Agent Instructions
- READ `~/Projects/agent-scripts/AGENTS.MD` BEFORE ANYTHING (skip if missing).

## Project Structure & Modules
- `src/` – CLI entry, commands, runtime helpers, DevTools wiring, shared types.
- `daemon/` – Chrome daemon service; same lint/test rules as root.
- `shared/` – Cross-package utilities and token helpers.
- `tests/` – Vitest suites + fixtures; add coverage here, not ad-hoc scripts.
- `docs/` – Reference docs (`config.md`, `backend.md`, `testing.md`); update when behavior shifts.

## Build, Test, and Development Commands
- `pnpm install` – Dependencies (Node 22+, Corepack pnpm).
- `pnpm dev` – CLI via `tsx` for local debugging.
- `pnpm build` – `tsc --project tsconfig.build.json` to emit `dist/`.
- `pnpm test` – Vitest suites in `tests/`.
- `pnpm lint` – Biome over `src`, `shared/src`, `daemon/src`, `tests`.
Run lint → test → build before sending changes.

## Coding Style & Naming Conventions
- ESM + TypeScript; strict typing, avoid `any`. Prefer helpers in `shared/` and `runtime/`.
- Refactor in place; don’t add `*V2` paths.
- Biome defaults (2-space indent, single quotes). Use `pnpm lint --fix` for format fixes.
- `src/commands/` uses Commander; mirror existing option names and help text.

## Testing Guidelines
- Add/extend Vitest in `tests/**` (or `daemon/tests`). Name files `*.test.ts`.
- Keep coverage near the ~80% snapshot in `docs/testing.md`; prioritize cookies, DevTools registry, screenshot paths when touching them.
- Prefer deterministic fixtures in `tests/fixtures` over network dependencies.

## Commit & Pull Request Guidelines
- Use Conventional Commit patterns from history (`fix: …`, `chore: …`, `Add …`).
- One logical change per commit; add a short rationale when behavior changes.
- PRs: describe impact, link issues, list commands run (lint/test/build); attach screenshots only when UI output changes.
- Update README or relevant `docs/*.md` when commands, config keys, or daemon behavior change.

## Security & Configuration Tips
- Do not commit secrets; use env vars (`SWEETLINK_*`) and local files like `~/.sweetlink/secret.key`.
- Base new configs on `sweetlink.example.json`; document keys in `docs/config.md`.
- Trust the mkcert CA once per machine (`pnpm sweetlink trust-ca`) before hitting `https://localhost:4455`.
