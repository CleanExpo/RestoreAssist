#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/assert.sh"
. "$DIR/../lib/common.sh"
. "$DIR/../lib/media.sh"

export LB_HOSTNAME="testbox"
assert_eq "$(media_dest 'RestoreAssist/public/videos/remotion')" \
  "gdrive:Backups/testbox/RestoreAssist/public/videos/remotion" "dest mapping"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export PATH="$DIR/stubs:$PATH"
export HOME="$TMP/home"; mkdir -p "$HOME/RestoreAssist/public/videos/remotion"
export RCLONE_LOG="$TMP/rclone.log"; : > "$RCLONE_LOG"

bash "$DIR/../backup-media.sh" >/dev/null
LOG="$(cat "$RCLONE_LOG")"
assert_contains "$LOG" "copy $HOME/RestoreAssist/public/videos/remotion gdrive:Backups/testbox/RestoreAssist/public/videos/remotion" "backup copies local->remote"

: > "$RCLONE_LOG"
bash "$DIR/../restore-media.sh" >/dev/null
LOG2="$(cat "$RCLONE_LOG")"
assert_contains "$LOG2" "copy gdrive:Backups/testbox/RestoreAssist/public/videos/remotion $HOME/RestoreAssist/public/videos/remotion" "restore copies remote->local"

: > "$RCLONE_LOG"
bash "$DIR/../backup-media.sh" --dry-run >/dev/null
assert_contains "$(cat "$RCLONE_LOG")" "--dry-run" "dry-run passes flag to rclone"

# Preflight fails clearly when remote missing.
RCLONE_REMOTES="other:" bash "$DIR/../backup-media.sh" 2>"$TMP/err" && echo "FAIL: should have errored"
assert_contains "$(cat "$TMP/err")" "remote" "missing remote errors"

assert_finish
