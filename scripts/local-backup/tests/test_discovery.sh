#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/assert.sh"
. "$DIR/../lib/common.sh"
. "$DIR/../lib/secrets.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/proj/node_modules" "$TMP/proj/sub"
printf 'A=1\n'  > "$TMP/proj/.env"
printf 'B=2\n'  > "$TMP/proj/.env.local"
printf 'C=3\n'  > "$TMP/proj/.env.example"
printf 'D=4\n'  > "$TMP/proj/node_modules/.env"
printf 'E=5\n'  > "$TMP/proj/sub/.env.production"

OUT="$(LB_ROOTS_OVERRIDE="$TMP" discover_env_files | sort)"
assert_contains "$OUT" "$TMP/proj/.env" "finds .env"
assert_contains "$OUT" "$TMP/proj/.env.local" "finds .env.local"
assert_contains "$OUT" "$TMP/proj/sub/.env.production" "finds nested .env.production"
case "$OUT" in *".env.example"*) echo "FAIL: example not excluded"; exit 1;; esac
case "$OUT" in *"node_modules"*) echo "FAIL: node_modules not pruned"; exit 1;; esac

assert_finish
