# Release Checklist (npm)

> Use the helper script for phased runs: `./scripts/release.sh <phase>` (gates | artifacts | publish | smoke | tag | all). It stops at the first failure so you can fix and resume.

1. **Version & metadata**
   - [ ] Update `package.json` version (e.g., `0.2.1`).
   - [ ] Confirm package metadata (`name`, `description`, `repository`, `keywords`, `license`, `files`) and `bin.sweetlink` -> `dist/src/index.js`.
   - [ ] If dependencies changed, rerun `pnpm install` to refresh `pnpm-lock.yaml`.

2. **Artifacts**
   - [ ] `pnpm run build` (ensure `dist/` is fresh).
   - [ ] `npm pack --pack-destination /tmp`.
   - [ ] Move `/tmp/sweetlink-<version>.tgz` to the repo root; generate `*.sha1` and `*.sha256` (do not commit these files).

3. **Changelog & docs**
   - [ ] Add release notes to the top of `CHANGELOG.md` (descending versions, one heading per version).
   - [ ] Update `README.md` or docs for any CLI flag or workflow changes.

4. **Validation**
   - [ ] `pnpm run lint`
   - [ ] `pnpm test`
   - [ ] `pnpm run build`

5. **Publish**
   - [ ] Ensure git is clean and you are logged into npm.
   - [ ] `pnpm publish --tag latest --access public`
   - [ ] `npm view sweetlink version` (and optionally `npm view sweetlink time`) to confirm registry state.

6. **Post-publish**
   - [ ] Tag and push: `git tag v<version> && git push origin v<version>`.
   - [ ] Create a GitHub release for `v<version>` titled `SweetLink <version>`; body = changelog bullets (no heading); attach the tarball + checksums.
   - [ ] Smoke-test from a clean directory: `npx -y sweetlink@<version> --version`.
   - [ ] Promote or adjust dist-tags if needed (`npm dist-tag add sweetlink@<version> latest`).
