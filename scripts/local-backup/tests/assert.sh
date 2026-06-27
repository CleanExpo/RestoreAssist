# Pure-bash assertions. Source after set -uo pipefail.
ASSERT_RUN=0; ASSERT_FAIL=0
assert_eq() {
  ASSERT_RUN=$((ASSERT_RUN+1))
  if [ "$1" != "$2" ]; then ASSERT_FAIL=$((ASSERT_FAIL+1)); printf 'FAIL %s: expected [%s] got [%s]\n' "$3" "$2" "$1"; fi
}
assert_contains() {
  ASSERT_RUN=$((ASSERT_RUN+1))
  case "$1" in *"$2"*) ;; *) ASSERT_FAIL=$((ASSERT_FAIL+1)); printf 'FAIL %s: [%s] missing [%s]\n' "$3" "$1" "$2";; esac
}
assert_file()   { ASSERT_RUN=$((ASSERT_RUN+1)); [ -f "$1" ] || { ASSERT_FAIL=$((ASSERT_FAIL+1)); printf 'FAIL %s: no file %s\n' "$2" "$1"; }; }
assert_nofile() { ASSERT_RUN=$((ASSERT_RUN+1)); [ ! -f "$1" ] || { ASSERT_FAIL=$((ASSERT_FAIL+1)); printf 'FAIL %s: unexpected file %s\n' "$2" "$1"; }; }
assert_finish() {
  printf 'ran=%d failed=%d\n' "$ASSERT_RUN" "$ASSERT_FAIL"
  [ "$ASSERT_FAIL" -eq 0 ]
}
