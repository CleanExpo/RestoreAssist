#!/usr/bin/env bash
set -euo pipefail
LB_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$LB_DIR/lib/common.sh"
. "$LB_DIR/lib/secrets.sh"

DRY_RUN=0
for a in "$@"; do case "$a" in --dry-run) DRY_RUN=1 ;; *) die "unknown arg: $a" ;; esac; done

VAULT="$(cfg_str '.secrets.vault')"

op whoami >/dev/null 2>&1 || die "Not signed in to 1Password. Run: eval \$(op signin)"

if [ "$DRY_RUN" -eq 1 ]; then printf "DRY-RUN: no changes will be written.\n"; fi

if [ "$DRY_RUN" -eq 0 ]; then
  op vault get "$VAULT" >/dev/null 2>&1 || op vault create "$VAULT" >/dev/null
fi

created=0; updated=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  title="$(env_path_to_title "$f")"
  project="${title%%/*}"
  if op item get "$title" --vault "$VAULT" >/dev/null 2>&1; then
    if [ "$DRY_RUN" -eq 1 ]; then log "would UPDATE $title"; else op document edit "$title" "$f" --vault "$VAULT" >/dev/null; fi
    updated=$((updated+1))
  else
    if [ "$DRY_RUN" -eq 1 ]; then log "would CREATE $title"; else op document create "$f" --title "$title" --vault "$VAULT" --tags "$project" >/dev/null; fi
    created=$((created+1))
  fi
done < <(discover_env_files)

printf 'created=%d updated=%d\n' "$created" "$updated"
