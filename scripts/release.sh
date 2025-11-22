#!/usr/bin/env bash
set -euo pipefail

# SweetLink release helper (npm)
# Phases: gates | artifacts | publish | smoke | tag | all
# Optional MCP_RUNNER wrapper: set MCP_RUNNER to a command that should prefix pnpm/npm.

RUNNER="${MCP_RUNNER:-}"
VERSION="${VERSION:-$(node -p "require('./package.json').version")}"

banner() { printf "\n==== %s ====\n" "$1"; }
run() { echo ">> $*"; "$@"; }

with_runner() {
  if [[ -n "$RUNNER" && -x "$RUNNER" ]]; then
    run "$RUNNER" "$@"
  else
    run "$@"
  fi
}

phase_gates() {
  banner "Gates (lint/test/build)"
  with_runner pnpm run lint
  with_runner pnpm test
  with_runner pnpm run build
}

phase_artifacts() {
  banner "Artifacts (npm pack + checksums)"
  with_runner pnpm run build
  with_runner npm pack --pack-destination /tmp
  mv "/tmp/sweetlink-${VERSION}.tgz" . 2>/dev/null || true

  local tgz
  tgz=$(find . -maxdepth 1 -name 'sweetlink-*.tgz' -print -quit)
  if [[ -z "$tgz" ]]; then
    echo "No tgz found after npm pack" >&2
    exit 1
  fi

  run shasum "$tgz" > "${tgz}.sha1"
  run shasum -a 256 "$tgz" > "${tgz}.sha256"
}

phase_publish() {
  banner "Publish to npm"
  with_runner pnpm publish --tag latest --access public
  with_runner npm view sweetlink version
  with_runner npm view sweetlink time
}

phase_smoke() {
  banner "Smoke test in empty dir"
  local tmp=/tmp/sweetlink-empty
  rm -rf "$tmp" && mkdir -p "$tmp"
  ( cd "$tmp" && npx -y "sweetlink@${VERSION}" --version )
}

phase_tag() {
  banner "Tag and push"
  git tag "v${VERSION}"
  git push origin "v${VERSION}"
}

usage() {
  cat <<'EOF'
Usage: scripts/release.sh [phase]

Phases (run individually or all):
  gates      pnpm lint, test, build
  artifacts  npm pack + sha1/sha256
  publish    pnpm publish --tag latest --access public, verify npm view
  smoke      empty-dir npx sweetlink@<version> --version
  tag        git tag v<version> && push the tag
  all        run everything in order

Environment:
  MCP_RUNNER (optional) - command to prefix pnpm/npm
  VERSION    (default from package.json)
EOF
}

main() {
  local phase="${1:-all}"
  case "$phase" in
    gates) phase_gates ;;
    artifacts) phase_artifacts ;;
    publish) phase_publish ;;
    smoke) phase_smoke ;;
    tag) phase_tag ;;
    all) phase_gates; phase_artifacts; phase_publish; phase_smoke; phase_tag ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"
