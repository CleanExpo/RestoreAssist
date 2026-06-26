#!/usr/bin/env bash
set -euo pipefail
LB_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$LB_DIR/lib/common.sh"
. "$LB_DIR/lib/media.sh"

DRY=()
for a in "$@"; do case "$a" in --dry-run) DRY=(--dry-run) ;; *) die "unknown arg: $a" ;; esac; done

media_preflight
n=0
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  src="$HOME/$rel"
  [ -d "$src" ] || { log "skip (no local dir): $rel"; continue; }
  log "backup: $rel -> $(media_dest "$rel")"
  rclone copy "$src" "$(media_dest "$rel")" "${DRY[@]+"${DRY[@]}"}"
  n=$((n+1))
done < <(cfg_list '.media.folders[]')
printf 'media_backed_up=%d\n' "$n"
