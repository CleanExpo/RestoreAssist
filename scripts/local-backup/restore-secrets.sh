#!/usr/bin/env bash
set -euo pipefail
LB_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$LB_DIR/lib/common.sh"
. "$LB_DIR/lib/secrets.sh"

DRY_RUN=0; FORCE=0; FILTER=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    --filter) FILTER="${2:-}"; shift ;;
    *) die "unknown arg: $1" ;;
  esac
  shift
done

VAULT="$(cfg_str '.secrets.vault')"
op whoami >/dev/null 2>&1 || die "Not signed in to 1Password. Run: eval \$(op signin)"
[ "$DRY_RUN" -eq 1 ] && log "DRY-RUN: no files will be written."

restored=0; skipped=0
while IFS= read -r title; do
  [ -n "$title" ] || continue
  if [ -n "$FILTER" ]; then case "$title" in "$FILTER"/*) ;; *) continue ;; esac; fi
  target="$(title_to_env_path "$title")"
  if [ -e "$target" ] && [ "$FORCE" -eq 0 ]; then
    log "skip (exists): $title  (use --force to overwrite)"; skipped=$((skipped+1)); continue
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    log "would restore $title -> $target"
  else
    mkdir -p "$(dirname "$target")"
    op document get "$title" --vault "$VAULT" > "$target"
  fi
  restored=$((restored+1))
done < <(op item list --vault "$VAULT" --format=json | jq -r '.[].title')

printf 'restored=%d skipped=%d\n' "$restored" "$skipped"
