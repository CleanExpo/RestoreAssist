#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/assert.sh"
. "$DIR/../lib/common.sh"
. "$DIR/../lib/secrets.sh"

HOME_BAK="$HOME"; export HOME="/Users/tester"
assert_eq "$(env_path_to_title "/Users/tester/RestoreAssist/.env.local")" "RestoreAssist/.env.local" "abs->title"
assert_eq "$(title_to_env_path "RestoreAssist/.env.local")" "/Users/tester/RestoreAssist/.env.local" "title->abs"
assert_eq "$(env_path_to_title "$(title_to_env_path "Synthex/.env")")" "Synthex/.env" "round trip"
export HOME="$HOME_BAK"

assert_finish
