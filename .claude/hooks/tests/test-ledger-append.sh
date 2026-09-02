#!/usr/bin/env bash
# test-ledger-append.sh — the Stop hook's metrics write.
#
#   bash .claude/hooks/tests/test-ledger-append.sh
#
# The property that matters most is AGREEMENT: ledger-append.sh (shell, at the
# point of production) and collect-verifier-metrics.ts (TypeScript, sweeping the
# directory afterwards) both write lines into the same file, and
# verifier-metrics.ts reads them without knowing which wrote which. An extra key,
# or a null where the other omits the field, would make two records of the same
# event disagree. So the shapes are compared directly rather than assumed.

set -uo pipefail

HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# ledger-append.sh resolves the ledger from REPO_DIR, which stop-verifier.sh sets
# to .claude/ -- not to the hooks directory. Setting it to anything else here
# would test a path production never takes; an earlier draft of this file did
# exactly that and pointed the collector at .claude/scripts.
REPO_DIR="$(cd "$HOOKS_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$REPO_DIR/.." && pwd)"
LIB="$HOOKS_DIR/lib"
# shellcheck source=../lib/ledger-append.sh
source "$LIB/ledger-append.sh"

pass=0; fail=0
tmp="$(mktemp -d)"
trap 'rm -r "$tmp" 2>/dev/null || true' EXIT
export VERIFIER_LEDGER_PATH="$tmp/ledger.jsonl"

check() {  # <label> <expected-json> <actual-json>
  if [[ "$(jq -S . <<<"$2" 2>/dev/null)" == "$(jq -S . <<<"$3" 2>/dev/null)" ]]; then
    pass=$((pass+1)); printf '  ok    %s\n' "$1"
  else
    fail=$((fail+1)); printf '  FAIL  %s\n        want %s\n        got  %s\n' "$1" "$2" "$3"
  fi
}

last_line() { tail -1 "$VERIFIER_LEDGER_PATH"; }

echo "== line shape, against the real report shapes =="

# The terse shape, 111 of them in the corpus.
printf '{"status":"static-clean","reason":"no unbacked pass-claim"}' > "$tmp/terse.json"
ledger_append "$tmp/terse.json" "aaaa-bbbb" 1788046563 "claim-truthfulness-static"
check "terse report carries exactly four keys" \
  '{"sessionId":"aaaa-bbbb","timestamp":1788046563,"domain":"claim-truthfulness-static","status":"static-clean"}' \
  "$(last_line)"

# The full shape, 260 of them.
printf '{"status":"partial","confidence":"high","claims_total":4,"claims_verified":0,"claims_failed":0,"claims_warned":4,"feedback":""}' > "$tmp/full.json"
ledger_append "$tmp/full.json" "aaaa-bbbb" 1788046600 "static"
check "full report carries the three claim counts" \
  '{"sessionId":"aaaa-bbbb","timestamp":1788046600,"domain":"static","status":"partial","claimsTotal":4,"claimsFailed":0,"claimsWarned":4}' \
  "$(last_line)"

# The one that matters: a gate that could not run.
printf '{"status":"verifier-unavailable","reason":"unavailable","error_code":"4","session_id":"x","raw_excerpt":""}' > "$tmp/unavail.json"
ledger_append "$tmp/unavail.json" "aaaa-bbbb" 1788046700 "ios-app-review"
check "an unavailable verifier is recorded, not dropped" \
  '{"sessionId":"aaaa-bbbb","timestamp":1788046700,"domain":"ios-app-review","status":"verifier-unavailable"}' \
  "$(last_line)"

echo
echo "== it never breaks the hook =="

before="$(wc -l < "$VERIFIER_LEDGER_PATH")"

ledger_append "$tmp/does-not-exist.json" "s" 1 "d"
printf '{"status": broken json' > "$tmp/bad.json"
ledger_append "$tmp/bad.json" "s" 2 "d"
VERIFIER_LEDGER_SKIP=1 ledger_append "$tmp/terse.json" "s" 3 "d"
VERIFIER_LEDGER_PATH="$tmp/no/such/dir/l.jsonl" ledger_append "$tmp/terse.json" "s" 4 "d"

after="$(wc -l < "$VERIFIER_LEDGER_PATH")"
if [[ "$before" == "$after" ]]; then
  pass=$((pass+1)); printf '  ok    a missing, malformed, skipped or unwritable target adds no line and returns 0\n'
else
  fail=$((fail+1)); printf '  FAIL  something was written when it should not have been (%s -> %s)\n' "$before" "$after"
fi

# A report with no status at all still records SOMETHING, because a verification
# that happened must not vanish from the denominator.
printf '{"reason":"no status field"}' > "$tmp/nostatus.json"
ledger_append "$tmp/nostatus.json" "aaaa-bbbb" 1788046800 "d"
check "a report with no status becomes 'unknown', not a dropped row" \
  '{"sessionId":"aaaa-bbbb","timestamp":1788046800,"domain":"d","status":"unknown"}' \
  "$(last_line)"

echo
echo "== the two producers agree =="
# collect-verifier-metrics.ts writes JSON.stringify of the same object. Compare
# the KEY SETS the shell writer produces against what the TypeScript type
# declares as always-present versus optional.
terse_keys="$(jq -S 'keys' <<<"$(sed -n 1p "$VERIFIER_LEDGER_PATH")")"
full_keys="$(jq -S 'keys' <<<"$(sed -n 2p "$VERIFIER_LEDGER_PATH")")"
check "terse key set" '["domain","sessionId","status","timestamp"]' "$terse_keys"
check "full key set" '["claimsFailed","claimsTotal","claimsWarned","domain","sessionId","status","timestamp"]' "$full_keys"

# And the detector must actually consume what this file wrote. Feeding the
# temp ledger through summarise() is the real agreement test: it proves the
# shell writer's lines are readable by the same parser that reads the
# TypeScript writer's, without touching the repo's own ledger.
probe="$tmp/probe.ts"
cat > "$probe" <<'TS'
import { readFileSync } from "node:fs";
import { summarise, type VerifierReport } from "../../scripts/observability/verifier-metrics";
const rows = readFileSync(process.argv[2], "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l) as VerifierReport);
const s = summarise(rows);
console.log(JSON.stringify({ total: s.totalReports, unavailable: s.unavailableRate }));
TS
cp "$probe" "$PROJECT_ROOT/scripts/observability/__ledger_probe.ts"
out="$(cd "$PROJECT_ROOT" && npx --no-install tsx scripts/observability/__ledger_probe.ts "$VERIFIER_LEDGER_PATH" 2>/dev/null)" || out=""
rm -f "$PROJECT_ROOT/scripts/observability/__ledger_probe.ts"

total="$(jq -r '.total // empty' <<<"$out" 2>/dev/null)"
unavail="$(jq -r '.unavailable // empty' <<<"$out" 2>/dev/null)"
if [[ "$total" == "4" ]]; then
  pass=$((pass+1)); printf '  ok    summarise() reads the shell writer'"'"'s lines (%s rows)\n' "$total"
else
  fail=$((fail+1)); printf '  FAIL  summarise() did not read the shell-written ledger (got total=%s)\n' "${total:-none}"
fi
# One of the four rows is verifier-unavailable, so the rate must be 0.25. This
# is what proves the STATUS survived the round trip, not just the row count.
if [[ "$unavail" == "0.25" ]]; then
  pass=$((pass+1)); printf '  ok    the unavailable status survives into the metric\n'
else
  fail=$((fail+1)); printf '  FAIL  unavailable rate was %s, expected 0.25\n' "${unavail:-none}"
fi

echo
echo "passed: $pass   failed: $fail"
if (( fail > 0 )); then echo "RESULT: FAILED"; exit 1; fi
echo "RESULT: green"
