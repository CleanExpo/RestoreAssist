#!/usr/bin/env bash
set -euo pipefail
LB_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$LB_DIR/lib/common.sh"
. "$LB_DIR/lib/media.sh"

OPTS=(); FORCE=0
for a in "$@"; do
  case "$a" in
    --dry-run) OPTS+=(--dry-run) ;;
    --force) FORCE=1 ;;
    *) die "unknown arg: $a" ;;
  esac
done
# Non-destructive by default: never overwrite existing local files unless --force.
[ "$FORCE" -eq 0 ] && OPTS+=(--ignore-existing)

media_preflight
n=0
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  dest="$HOME/$rel"
  log "restore: $(media_dest "$rel") -> $dest"
  mkdir -p "$dest"
  rclone copy "$(media_dest "$rel")" "$dest" "${OPTS[@]+"${OPTS[@]}"}"
  n=$((n+1))
done < <(cfg_list '.media.folders[]')
printf 'media_restored=%d\n' "$n"
