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
  dest="$HOME/$rel"
  log "restore: $(media_dest "$rel") -> $rel"
  mkdir -p "$dest"
  rclone copy "$(media_dest "$rel")" "$dest" "${DRY[@]+"${DRY[@]}"}"
  n=$((n+1))
done < <(cfg_list '.media.folders[]')
printf 'media_restored=%d\n' "$n"
