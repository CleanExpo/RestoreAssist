#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/assert.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export OP_STUB_DIR="$TMP/opstate"
export PATH="$DIR/stubs:$PATH"
export HOME="$TMP/home"; mkdir -p "$HOME"

# Seed vault state directly (simulate a prior backup).
mkdir -p "$OP_STUB_DIR/Local-Env-Backups"
printf 'A=1\n' > "$OP_STUB_DIR/Local-Env-Backups/RestoreAssist%2F.env"
printf 'B=2\n' > "$OP_STUB_DIR/Local-Env-Backups/Synthex%2F.env.local"

# Restore everything onto a clean HOME.
OUT1="$(bash "$DIR/../restore-secrets.sh")"
assert_contains "$OUT1" "restored=2" "restores both"
assert_file "$HOME/RestoreAssist/.env" "RestoreAssist/.env written"
assert_eq "$(cat "$HOME/Synthex/.env.local")" "B=2" "content correct"

# Non-destructive: existing file is skipped without --force.
printf 'LOCAL=keep\n' > "$HOME/RestoreAssist/.env"
OUT2="$(bash "$DIR/../restore-secrets.sh")"
assert_contains "$OUT2" "skipped=2" "skips existing without force"
assert_eq "$(cat "$HOME/RestoreAssist/.env")" "LOCAL=keep" "existing file untouched"

# --force overwrites.
OUT3="$(bash "$DIR/../restore-secrets.sh" --force)"
assert_eq "$(cat "$HOME/RestoreAssist/.env")" "A=1" "force overwrites"

# --filter limits to one project.
rm -rf "$HOME/RestoreAssist" "$HOME/Synthex"
OUT4="$(bash "$DIR/../restore-secrets.sh" --filter Synthex)"
assert_contains "$OUT4" "restored=1" "filter restores one"
assert_nofile "$HOME/RestoreAssist/.env" "filtered-out project not restored"

assert_finish
