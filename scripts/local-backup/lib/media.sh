# Sourced after common.sh.
media_dest() {
  local rel="$1" remote prefix host
  remote="$(cfg_str '.media.remote')"
  prefix="$(cfg_str '.media.destPrefix')"
  host="$(lb_hostname)"
  printf '%s:%s/%s/%s\n' "$remote" "$prefix" "$host" "$rel"
}

media_preflight() {
  local remote; remote="$(cfg_str '.media.remote')"
  rclone listremotes 2>/dev/null | grep -q "^${remote}:$" || die "rclone remote '${remote}:' not found. Run: rclone config"
}
