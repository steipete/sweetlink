# SweetLink Sync Notes

These steps keep the standalone repository aligned with the Sweetistics monorepo.

1. From `/Users/steipete/Projects/sweetistics`, mirror the package:
   ```bash
   rsync -a --delete apps/sweetlink/ ~/Projects/sweetlink/
   ```
2. Regenerate distributable artifacts if they are stale:
   ```bash
   pnpm --filter @sweetistics/sweetlink run build
   ```
3. Update the standalone `.gitignore` if new temp directories appear.
4. Commit from `~/Projects/sweetlink` and push to `https://github.com/steipete/sweetlink.git`.

Keep these notes out of the published README so that end users only see the product documentation.
