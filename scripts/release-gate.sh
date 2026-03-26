#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/lib/ops.sh"
init_ops "$ROOT_DIR"

REQUIRE_HEALTH=0
SKIP_TESTS=0
SKIP_BUILD=0

usage() {
  cat <<'HELP'
Usage:
  scripts/release-gate.sh [--require-health] [--skip-tests] [--skip-build]

Checks:
- ops smoke checks
- tests
- typecheck
- lint
- build
HELP
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --require-health)
      REQUIRE_HEALTH=1
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=1
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "$EXIT_USAGE" "Unknown argument: $1"
      ;;
  esac
done

if [ "$REQUIRE_HEALTH" -eq 1 ]; then
  log_info "[release-gate] Running ops smoke (require health)"
  npm run ops:smoke -- --require-health
else
  log_info "[release-gate] Running ops smoke"
  npm run ops:smoke
fi

if [ "$SKIP_TESTS" -ne 1 ]; then
  log_info "[release-gate] Running tests"
  npm test
fi

log_info "[release-gate] Running typecheck"
npm run typecheck

log_info "[release-gate] Running lint"
npm run lint

if [ "$SKIP_BUILD" -ne 1 ]; then
  log_info "[release-gate] Running build"
  npm run build
fi

log_info "[release-gate] All checks passed"
