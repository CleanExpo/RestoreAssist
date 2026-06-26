# Sourced by all scripts. Requires: jq.
LB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${LB_CONFIG:-$LB_DIR/backup.config.json}"

log() { printf '%s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

cfg_str()  { jq -r "$1" "$CONFIG"; }
cfg_list() { jq -r "$1" "$CONFIG"; }

lb_hostname() { printf '%s\n' "${LB_HOSTNAME:-$(hostname -s)}"; }
