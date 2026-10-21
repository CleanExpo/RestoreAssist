#!/usr/bin/env bash
# Run JEV families against the long-lived dev database from db-up.sh.
#   tests/eval/jev/runner/dev-run.sh [vitest file filter...]
# Output: tests/eval/jev/out/<FAMILY>.jsonl, vitest log on stdout.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
set -a
. "$ROOT/tests/eval/jev/out/dev-db.env"
set +a
node "$ROOT/scripts/ci/assert-local-test-db.mjs"
exec npx --no-install vitest run --config config/vitest.jev.config.js --reporter=dot "$@"
