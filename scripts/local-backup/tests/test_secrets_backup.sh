#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/assert.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export OP_STUB_DIR="$TMP/opstate"
export PATH="$DIR/stubs:$PATH"          # stub op shadows real op
export HOME="$TMP/home"
mkdir -p "$HOME/proj"
printf 'A=1\n' > "$HOME/proj/.env"
printf 'B=2\n' > "$HOME/proj/.env.local"
export LB_ROOTS_OVERRIDE="$HOME"

# First run: two creates.
OUT1="$(bash "$DIR/../backup-secrets.sh")"
assert_contains "$OUT1" "created=2" "first run creates 2"
assert_file "$OP_STUB_DIR/Local-Env-Backups/proj%2F.env" "doc stored for .env"

# Second run: idempotent, two updates, no new files beyond the two.
OUT2="$(bash "$DIR/../backup-secrets.sh")"
assert_contains "$OUT2" "updated=2" "second run updates 2"
COUNT="$(ls -1 "$OP_STUB_DIR/Local-Env-Backups" | wc -l | tr -d ' ')"
assert_eq "$COUNT" "2" "no duplicate items"

# Dry run on a fresh vault writes nothing.
rm -rf "$OP_STUB_DIR"
OUT3="$(bash "$DIR/../backup-secrets.sh" --dry-run)"
assert_contains "$OUT3" "DRY-RUN" "dry-run announces"
assert_nofile "$OP_STUB_DIR/Local-Env-Backups/proj%2F.env" "dry-run writes nothing"

assert_finish
