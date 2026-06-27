#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
fails=0
for t in "$DIR"/test_*.sh; do
  printf '== %s ==\n' "$(basename "$t")"
  bash "$t" || fails=$((fails+1))
done
printf '\n==== %d test file(s) failed ====\n' "$fails"
[ "$fails" -eq 0 ]
