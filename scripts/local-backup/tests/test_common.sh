#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/assert.sh"
. "$DIR/../lib/common.sh"

assert_eq "$(cfg_str '.secrets.vault')" "Local-Env-Backups" "vault name from config"
assert_contains "$(cfg_list '.secrets.includeGlobs[]')" ".env" "includeGlobs has .env"
LB_HOSTNAME="testbox" assert_eq "$(LB_HOSTNAME=testbox lb_hostname)" "testbox" "hostname override"

assert_finish
