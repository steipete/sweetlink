---
summary: Notes for keeping the standalone Sweetlink repo in sync with the Sweetistics monorepo.
---

## Monorepo Sync Ritual

- Run `rsync -av --delete --exclude '.git/' --exclude 'node_modules/' --exclude 'dist/' --exclude 'coverage/' --exclude 'tmp/' /Users/steipete/Projects/sweetistics/apps/sweetlink/ /Users/steipete/Projects/sweetlink/` from the Sweetistics root whenever we need to refresh this repo.
- Because this lives outside the monorepo, skip `./runner` and call git/pnpm directly in `~/Projects/sweetlink`.
- Immediately review the diff, ensure `.gitignore` or other standalone-only files are re-added if necessary, then commit with `chore: sync sweetlink from sweetistics` (or a scoped variant) and push to `origin/main`.
- Document any extra steps (tests, release prep, etc.) in this file so the sync process stays predictable.
