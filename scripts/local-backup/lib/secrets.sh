# Sourced after common.sh. Provides secret-file discovery + path<->title mapping.

# Expand a leading ~ to $HOME.
_expand_tilde() {
  case "$1" in
    "~") printf '%s\n' "$HOME" ;;
    "~/"*) printf '%s\n' "$HOME/${1#~/}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

discover_env_files() {
  local roots=() includes=() excludes=() prunes=()
  if [ -n "${LB_ROOTS_OVERRIDE:-}" ]; then
    roots=("$LB_ROOTS_OVERRIDE")
  else
    while IFS= read -r r; do roots+=("$(_expand_tilde "$r")"); done < <(cfg_list '.secrets.roots[]')
  fi
  while IFS= read -r g; do includes+=("$g"); done < <(cfg_list '.secrets.includeGlobs[]')
  while IFS= read -r g; do excludes+=("$g"); done < <(cfg_list '.secrets.excludeGlobs[]')
  while IFS= read -r p; do prunes+=("$p"); done < <(cfg_list '.secrets.excludePaths[]')

  # Build find predicate arrays.
  local prune_expr=() inc_expr=() exc_expr=()
  local first=1 p g
  for p in "${prunes[@]}"; do
    if [ "$first" -eq 1 ]; then prune_expr+=( -name "$p" ); first=0
    else prune_expr+=( -o -name "$p" ); fi
  done
  first=1
  for g in "${includes[@]}"; do
    if [ "$first" -eq 1 ]; then inc_expr+=( -name "$g" ); first=0
    else inc_expr+=( -o -name "$g" ); fi
  done
  for g in "${excludes[@]}"; do exc_expr+=( ! -name "$g" ); done

  local root
  for root in "${roots[@]}"; do
    [ -d "$root" ] || continue
    find "$root" \
      \( -type d \( "${prune_expr[@]}" \) -prune \) -o \
      \( -type f \( "${inc_expr[@]}" \) "${exc_expr[@]}" -print \)
  done
}
