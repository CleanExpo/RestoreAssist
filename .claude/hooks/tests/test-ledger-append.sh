#!/usr/bin/env bash
# test-ledger-append.sh — the Stop hook's metrics write.
#
#   bash .claude/hooks/tests/test-ledger-append.sh
#
# Two properties matter most.
#
# AGREEMENT: ledger-append.sh (shell, at the point of production) and
# collect-verifier-metrics.ts (TypeScript, sweeping the directory afterwards)
# both write entries into scripts/observability/verifier-ledger.d/, and
# scripts/observability/ledger.ts reads them without knowing which wrote which.
# An extra key, a null where the other omits the field, or a different file name
# for the same event would make two records of one event disagree. So the shapes
# and the names are compared directly rather than assumed.
#
# NO SHARED FILE: every mesh branch used to append to one verifier-ledger.jsonl,
# so whichever PR merged first left every other open PR conflicting on it. Each
# entry is now its own file, and the old .jsonl is frozen history. The merge test
# below runs two real branches through git and requires a clean merge.
#
# ONE EVENT, ONE NAME: the file name is the idempotency key (session, timestamp,
# domain) in a form that cannot run two keys together. Two domains that sanitise
# to the same text ("a/b" and "a?b") must still get two files. The shared vector
# file scripts/observability/__tests__/ledger-name-vectors.json lists names
# computed by neither writer; this file holds the shell writer to it and
# ledger.test.ts holds ledger.ts to it.

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
# Under TMPDIR when it is set. A bare `mktemp -d` ignores TMPDIR on macOS, so a
# sandbox that only allows writes under its own TMPDIR could not run this file.
tmp="$(mktemp -d "${TMPDIR:-/tmp}/ledger-test.XXXXXX")" || { echo "RESULT: FAILED (no temporary directory)"; exit 1; }
trap 'rm -rf "$tmp" 2>/dev/null || true' EXIT
export VERIFIER_LEDGER_DIR="$tmp/ledger.d"
unset VERIFIER_LEDGER_PATH VERIFIER_LEDGER_SKIP

check() {  # <label> <expected-json> <actual-json>
  if [[ "$(jq -S . <<<"$2" 2>/dev/null)" == "$(jq -S . <<<"$3" 2>/dev/null)" ]]; then
    pass=$((pass+1)); printf '  ok    %s\n' "$1"
  else
    fail=$((fail+1)); printf '  FAIL  %s\n        want %s\n        got  %s\n' "$1" "$2" "$3"
  fi
}
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

entry_count() { find "${1:-$VERIFIER_LEDGER_DIR}" -maxdepth 1 -type f -name '*.jsonl' 2>/dev/null | wc -l | tr -d ' '; }
# The entry for one timestamp. Every call below uses a distinct timestamp, so a
# glob on it names exactly one file.
entry_for() { cat "$VERIFIER_LEDGER_DIR"/"$1"-*.jsonl 2>/dev/null; }

echo "== line shape, against the real report shapes =="

# The terse shape, 111 of them in the corpus.
printf '{"status":"static-clean","reason":"no unbacked pass-claim"}' > "$tmp/terse.json"
ledger_append "$tmp/terse.json" "aaaa-bbbb" 1788046563 "claim-truthfulness-static"
check "terse report carries exactly four keys" \
  '{"sessionId":"aaaa-bbbb","timestamp":1788046563,"domain":"claim-truthfulness-static","status":"static-clean"}' \
  "$(entry_for 1788046563)"

# The full shape, 260 of them.
printf '{"status":"partial","confidence":"high","claims_total":4,"claims_verified":0,"claims_failed":0,"claims_warned":4,"feedback":""}' > "$tmp/full.json"
ledger_append "$tmp/full.json" "aaaa-bbbb" 1788046600 "static"
check "full report carries the three claim counts" \
  '{"sessionId":"aaaa-bbbb","timestamp":1788046600,"domain":"static","status":"partial","claimsTotal":4,"claimsFailed":0,"claimsWarned":4}' \
  "$(entry_for 1788046600)"

# The one that matters: a gate that could not run.
printf '{"status":"verifier-unavailable","reason":"unavailable","error_code":"4","session_id":"x","raw_excerpt":""}' > "$tmp/unavail.json"
ledger_append "$tmp/unavail.json" "aaaa-bbbb" 1788046700 "ios-app-review"
check "an unavailable verifier is recorded, not dropped" \
  '{"sessionId":"aaaa-bbbb","timestamp":1788046700,"domain":"ios-app-review","status":"verifier-unavailable"}' \
  "$(entry_for 1788046700)"

echo
echo "== one entry, one file =="

if [[ "$(entry_count)" == "3" ]]; then
  ok "three appends made three entry files"
else
  bad "expected 3 entry files in the ledger directory, found $(entry_count)"
fi
multi=0
for f in "$VERIFIER_LEDGER_DIR"/*.jsonl; do
  [[ -f "$f" && "$(wc -l < "$f" | tr -d ' ')" == "1" ]] || multi=$((multi+1))
done
if (( multi == 0 )); then ok "every entry file holds exactly one line"; else bad "$multi entry file(s) missing or holding more than one line"; fi

# Re-recording the same event (same session, timestamp and domain) names the
# same file, so it overwrites rather than duplicates. That is the idempotency
# key the readers dedupe on, carried into the file name.
ledger_append "$tmp/terse.json" "aaaa-bbbb" 1788046563 "claim-truthfulness-static"
if [[ "$(entry_count)" == "3" ]]; then
  ok "re-recording the same event adds no file"
else
  bad "re-recording the same event changed the entry count to $(entry_count)"
fi
# A domain with a path separator in it must not escape the directory.
ledger_append "$tmp/terse.json" "aaaa-bbbb" 1788046650 "../../evil"
if [[ ! -e "$tmp/evil" && "$(entry_count)" == "4" ]]; then
  ok "a domain is sanitised into the file name, never a path"
else
  bad "a domain containing ../ was not contained to the ledger directory"
fi
rm -f "$VERIFIER_LEDGER_DIR"/1788046650-*.jsonl

echo
echo "== one event, one name =="
# The reproduced defect (RA-8661 review): one session records two domains in the
# same second, and both domains sanitise to "a_b". While the name was built from
# the sanitised domain alone, the second write replaced the first and a
# verification record was lost. Kept in its own directory so the counts the
# agreement probe checks further down are not disturbed.
collide="$tmp/collide.d"
VERIFIER_LEDGER_DIR="$collide" ledger_append "$tmp/unavail.json" "aaaa-bbbb" 1788046900 "a/b"
VERIFIER_LEDGER_DIR="$collide" ledger_append "$tmp/terse.json" "aaaa-bbbb" 1788046900 "a?b"
if [[ "$(entry_count "$collide")" == "2" ]]; then
  ok "domains a/b and a?b in one session and second make two entry files"
else
  bad "domains a/b and a?b in one session and second made $(entry_count "$collide") entry file(s), expected 2"
fi
check "both records survive, each with its own status" \
  '[{"domain":"a/b","status":"verifier-unavailable"},{"domain":"a?b","status":"static-clean"}]' \
  "$(cat "$collide"/*.jsonl 2>/dev/null | jq -s -c 'map({domain, status}) | sort_by(.domain)' 2>/dev/null)"

# The shared name vectors. Each expected name was computed by neither writer.
vectors_file="$PROJECT_ROOT/scripts/observability/__tests__/ledger-name-vectors.json"
vectors_dir="$tmp/vectors.d"
vector_total="$(jq -r '.vectors | length' "$vectors_file" 2>/dev/null)"
vector_total="${vector_total:-0}"
vector_bad=0
for (( i = 0; i < vector_total; i++ )); do
  # A trailing "x" keeps a value that ends in a line break intact through $(...).
  v_session="$(jq -j --argjson i "$i" '.vectors[$i].sessionId + "x"' "$vectors_file")"; v_session="${v_session%x}"
  v_domain="$(jq -j --argjson i "$i" '.vectors[$i].domain + "x"' "$vectors_file")"; v_domain="${v_domain%x}"
  v_ts="$(jq -r --argjson i "$i" '.vectors[$i].timestamp' "$vectors_file")"
  v_name="$(jq -r --argjson i "$i" '.vectors[$i].name' "$vectors_file")"
  VERIFIER_LEDGER_DIR="$vectors_dir" ledger_append "$tmp/terse.json" "$v_session" "$v_ts" "$v_domain"
  if [[ ! -f "$vectors_dir/$v_name" ]]; then
    vector_bad=$((vector_bad+1))
    printf '        no file named %s (%s)\n' "$v_name" "$(jq -r --argjson i "$i" '.vectors[$i].case' "$vectors_file")"
  fi
done
if (( vector_total >= 10 && vector_bad == 0 )) && [[ "$(entry_count "$vectors_dir")" == "$vector_total" ]]; then
  ok "the shell writer produces every one of the $vector_total shared vector names"
else
  bad "shared name vectors: $vector_total listed, $vector_bad not produced, $(entry_count "$vectors_dir") file(s) written"
fi
stray="$(find "$vectors_dir" -maxdepth 1 -name '*
*' 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$stray" == "0" ]]; then
  ok "no entry file name carries a line break"
else
  bad "$stray entry file name(s) carry a line break"
fi

echo
echo "== the report rule =="
# THE REPORT RULE of scripts/observability/ledger.ts: whatever a report holds,
# the verification happened and leaves a record. A report that is not an object,
# a status that is not text and a count that is not a whole number from 0 up
# each cost the record that one value and nothing else. The shared vectors were
# written by hand from the rule; ledger.test.ts holds ledger.ts to the same
# file. Each case below writes into its own directory, so the counts the
# agreement probe checks further down are not disturbed.

# The reproduced defect (RA-8661 review, third round): 1e400 is valid JSON, and
# both writers passed it on as a count the reader then refused, so the failed
# verification was dropped whole. The count is left out and the record stays.
printf '{"status":"failed","claims_total":1e400,"claims_failed":1}' > "$tmp/overflow.json"
overflow_dir="$tmp/overflow.d"
VERIFIER_LEDGER_DIR="$overflow_dir" ledger_append "$tmp/overflow.json" "overflow" 1788050000 "static"
check "a count too large to be a number is left out and the failed verification is kept" \
  '{"sessionId":"overflow","timestamp":1788050000,"domain":"static","status":"failed","claimsFailed":1}' \
  "$(cat "$overflow_dir"/1788050000-*.jsonl 2>/dev/null)"

# A report that is valid JSON but not an object. jq could not index it, the
# writer swallowed the error, and the verification left no record at all.
printf '[{"status":"failed"}]' > "$tmp/list.json"
notobj_dir="$tmp/notobj.d"
VERIFIER_LEDGER_DIR="$notobj_dir" ledger_append "$tmp/list.json" "list" 1788050100 "static"
check "a report that is not an object still leaves a record" \
  '{"sessionId":"list","timestamp":1788050100,"domain":"static","status":"unknown"}' \
  "$(cat "$notobj_dir"/1788050100-*.jsonl 2>/dev/null)"

report_vectors="$PROJECT_ROOT/scripts/observability/__tests__/ledger-report-vectors.json"
report_dir="$tmp/report-vectors.d"
rv_session="$(jq -r '.sessionId' "$report_vectors" 2>/dev/null)"
rv_domain="$(jq -r '.domain' "$report_vectors" 2>/dev/null)"
rv_total="$(jq -r '.vectors | length' "$report_vectors" 2>/dev/null)"
rv_total="${rv_total:-0}"
for (( i = 0; i < rv_total; i++ )); do
  rv_ts="$(jq -r --argjson i "$i" '.vectors[$i].timestamp' "$report_vectors")"
  jq -j --argjson i "$i" '.vectors[$i].report' "$report_vectors" > "$tmp/rv-report.json"
  VERIFIER_LEDGER_DIR="$report_dir" ledger_append "$tmp/rv-report.json" "$rv_session" "$rv_ts" "$rv_domain"
  check "$(jq -r --argjson i "$i" '.vectors[$i].case' "$report_vectors")" \
    "$(jq -c --argjson i "$i" '.vectors[$i].line' "$report_vectors")" \
    "$(cat "$report_dir"/"$rv_ts"-*.jsonl 2>/dev/null)"
done
if (( rv_total >= 10 )) && [[ "$(entry_count "$report_dir")" == "$rv_total" ]]; then
  ok "each of the $rv_total shared report vectors left exactly one entry"
else
  bad "shared report vectors: $rv_total listed, $(entry_count "$report_dir") entry file(s) written"
fi

# The generated cases: every value in every shape, which is each kind of JSON
# value as the whole report, as the status and as each count. No shape may write
# nothing. The list is kept so the agreement probe can put each report through
# ledger.ts and compare.
matrix_dir="$tmp/matrix.d"
matrix_list="$tmp/matrix.jsonl"
jq -c '[.values[] as $v | .shapes[] | split("@") | join($v)] | to_entries[] | {timestamp: (1788060001 + .key), report: .value}' \
  "$report_vectors" > "$matrix_list" 2>/dev/null
matrix_total="$(wc -l < "$matrix_list" | tr -d ' ')"
while IFS=$'\t' read -r m_ts m_report; do
  printf '%s' "$m_report" > "$tmp/matrix-report.json"
  VERIFIER_LEDGER_DIR="$matrix_dir" ledger_append "$tmp/matrix-report.json" "$rv_session" "$m_ts" "$rv_domain"
done < <(jq -r '"\(.timestamp)\t\(.report)"' "$matrix_list" 2>/dev/null)
if (( matrix_total >= 60 )) && [[ "$(entry_count "$matrix_dir")" == "$matrix_total" ]]; then
  ok "every one of the $matrix_total generated reports left an entry"
else
  bad "generated reports: $matrix_total built, $(entry_count "$matrix_dir") entry file(s) written"
fi

# A timestamp the two writers would not render the same way is refused, not guessed.
VERIFIER_LEDGER_DIR="$tmp/oddts.d" ledger_append "$tmp/terse.json" "s" 007 "d"
VERIFIER_LEDGER_DIR="$tmp/oddts.d" ledger_append "$tmp/terse.json" "s" 12345678901234567890 "d"
if [[ "$(entry_count "$tmp/oddts.d")" == "0" ]]; then
  ok "a timestamp with a leading zero or beyond 15 digits writes no entry"
else
  bad "a timestamp the two writers render differently still wrote $(entry_count "$tmp/oddts.d") entry file(s)"
fi

echo
echo "== it never breaks the hook =="

before="$(entry_count)"

ledger_append "$tmp/does-not-exist.json" "s" 1 "d"
printf '{"status": broken json' > "$tmp/bad.json"
ledger_append "$tmp/bad.json" "s" 2 "d"
VERIFIER_LEDGER_SKIP=1 ledger_append "$tmp/terse.json" "s" 3 "d"
VERIFIER_LEDGER_DIR="$tmp/no/such/dir/ledger.d" ledger_append "$tmp/terse.json" "s" 4 "d"
rc=$?

after="$(entry_count)"
if [[ "$before" == "$after" && "$rc" == "0" && ! -e "$tmp/no" ]]; then
  ok "a missing, malformed, skipped or unwritable target adds no entry and returns 0"
else
  bad "something was written when it should not have been ($before -> $after, rc=$rc)"
fi

# The legacy override still works, and is mapped to a sibling directory so a
# caller that names a .jsonl file can never append to it again.
legacy="$tmp/legacy/verifier-ledger.jsonl"
mkdir -p "$tmp/legacy" && printf '%s\n' '{"sessionId":"old","timestamp":1,"domain":"d","status":"ok"}' > "$legacy"
legacy_sum="$(cksum < "$legacy")"
(unset VERIFIER_LEDGER_DIR; VERIFIER_LEDGER_PATH="$legacy" ledger_append "$tmp/terse.json" "s" 5 "d")
if [[ "$(cksum < "$legacy")" == "$legacy_sum" && "$(entry_count "$tmp/legacy/verifier-ledger.d")" == "1" ]]; then
  ok "VERIFIER_LEDGER_PATH=<file>.jsonl writes to <file>.d/ and leaves the file untouched"
else
  bad "VERIFIER_LEDGER_PATH was not mapped to a sibling .d directory, or the .jsonl changed"
fi

# A report with no status at all still records SOMETHING, because a verification
# that happened must not vanish from the denominator.
printf '{"reason":"no status field"}' > "$tmp/nostatus.json"
ledger_append "$tmp/nostatus.json" "aaaa-bbbb" 1788046800 "d"
check "a report with no status becomes 'unknown', not a dropped row" \
  '{"sessionId":"aaaa-bbbb","timestamp":1788046800,"domain":"d","status":"unknown"}' \
  "$(entry_for 1788046800)"

echo
echo "== two branches append concurrently and still merge cleanly =="
# The regression this layout exists for. A base commit carries the frozen
# history; two branches each record a verification through the real production
# path (REPO_DIR, no override), commit, and are merged. With a shared append-only
# file, git sees both branches add a line at the same end of it and conflicts.

repo="$tmp/repo"
g() { git -C "$repo" -c user.name=ledger-test -c user.email=ledger-test@example.invalid -c commit.gpgsign=false "$@"; }
mkdir -p "$repo/.claude" "$repo/scripts/observability"
printf '%s\n' '{"sessionId":"history","timestamp":1700000000,"domain":"static","status":"static-clean"}' \
  > "$repo/scripts/observability/verifier-ledger.jsonl"
g init -q >/dev/null 2>&1
g checkout -q -b base 2>/dev/null
g add -A && g commit -qm base
frozen_sum="$(cksum < "$repo/scripts/observability/verifier-ledger.jsonl")"

branch_append() {  # <branch> <session>
  g checkout -q -b "$1" base
  ( unset VERIFIER_LEDGER_DIR VERIFIER_LEDGER_PATH
    REPO_DIR="$repo/.claude"
    ledger_append "$tmp/full.json" "$2" 1788050000 "claim-truthfulness" )
  g add -A && g commit -qm "verify on $1"
}
branch_append branch-a "session-aaaa"
branch_append branch-b "session-bbbb"

shared="$(comm -12 <(g diff --name-only base branch-a | sort) <(g diff --name-only base branch-b | sort))"
if [[ -z "$shared" ]]; then
  ok "the two branches change no file in common"
else
  bad "both branches changed: $shared"
fi

g checkout -q branch-a
if g merge -q --no-edit branch-b >/dev/null 2>&1; then
  ok "merging one branch into the other does not conflict"
else
  bad "merging branch-b into branch-a conflicted"
  g merge --abort >/dev/null 2>&1 || true
fi
if [[ "$(cksum < "$repo/scripts/observability/verifier-ledger.jsonl")" == "$frozen_sum" ]]; then
  ok "the frozen verifier-ledger.jsonl is never appended to"
else
  bad "the frozen verifier-ledger.jsonl was modified"
fi

echo
echo "== the two producers agree =="
# collect-verifier-metrics.ts writes the same object through ledger.ts. Compare
# the KEY SETS the shell writer produces against what the TypeScript type
# declares as always-present versus optional.
terse_keys="$(jq -S 'keys' <<<"$(entry_for 1788046563)")"
full_keys="$(jq -S 'keys' <<<"$(entry_for 1788046600)")"
check "terse key set" '["domain","sessionId","status","timestamp"]' "$terse_keys"
check "full key set" '["claimsFailed","claimsTotal","claimsWarned","domain","sessionId","status","timestamp"]' "$full_keys"

# And the reader must actually consume what this file wrote. Feeding the temp
# directories through readLedger() and summarise() is the real agreement test:
# it proves the shell writer's entries are readable by the same parser that
# reads the TypeScript writer's, and named the way the TypeScript writer would
# name them, without touching the repo's own ledger.
if ! command -v npx >/dev/null 2>&1 || [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
  # Distinguish "did not run" from "ran and found nothing", per
  # .claude/rules/verification-gate.md. A missing toolchain is not a shape
  # mismatch, and reporting it as one would send someone hunting the wrong bug.
  printf '  SKIP  the agreement probe needs tsx and node_modules; run npm ci to include it\n'
  echo
  echo "passed: $pass   failed: $fail   (agreement probe did not run)"
  if (( fail > 0 )); then echo "RESULT: FAILED"; exit 1; fi
  echo "RESULT: green (with a skip)"
  exit 0
fi

probe_name="__ledger_probe_$$.ts"
cat > "$PROJECT_ROOT/scripts/observability/$probe_name" <<'TS'
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { entryFileName, entryLine, readLedger, reportFields } from "./ledger";
import { summarise } from "./verifier-metrics";
const [dir, mergedRoot, vectorsDir, reportDir, matrixDir, matrixList, reportVectorsFile] = process.argv.slice(2);
// What the shell writer put on disk, parsed as it stands. No reader in between,
// so a count the reader would tidy away still shows here.
const onDisk = (d: string) =>
  readdirSync(d)
    .filter((n) => n.endsWith(".jsonl"))
    .map((n) => JSON.parse(readFileSync(join(d, n), "utf8")))
    .sort((a, b) => a.timestamp - b.timestamp);
const rv = JSON.parse(readFileSync(reportVectorsFile, "utf8"));
// The line ledger.ts would have written for the same report.
const mine = (report: string, timestamp: number) =>
  JSON.parse(entryLine({ sessionId: rv.sessionId, timestamp, domain: rv.domain, ...reportFields(JSON.parse(report)) }));
// Keys in the same order and every value the same. JSON.stringify turns a
// number too large to hold into null, so such a count can never pass as absent.
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const matrix = readFileSync(matrixList, "utf8").split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l));
const shellMatrix = onDisk(matrixDir);
const tsMatrix = matrix.map((m) => mine(m.report, m.timestamp));
const diffAt = tsMatrix.findIndex((want, i) => !same(shellMatrix[i], want));
const rows = readLedger(join(dir, "..", "absent.jsonl"), dir);
const s = summarise(rows);
const names = readdirSync(dir).filter((n) => n.endsWith(".jsonl")).sort();
const expected = rows.map((r) => entryFileName(r)).sort();
const merged = readLedger(
  join(mergedRoot, "scripts", "observability", "verifier-ledger.jsonl"),
  join(mergedRoot, "scripts", "observability", "verifier-ledger.d"),
);
const vectorRows = readLedger(join(vectorsDir, "..", "absent.jsonl"), vectorsDir);
const vectorNames = readdirSync(vectorsDir).filter((n) => n.endsWith(".jsonl")).sort();
console.log(JSON.stringify({
  vectorRows: vectorRows.length,
  vectorNamesAgree: JSON.stringify(vectorNames) === JSON.stringify(vectorRows.map((r) => entryFileName(r)).sort()),
  total: s.totalReports,
  unavailable: s.unavailableRate,
  namesAgree: JSON.stringify(names) === JSON.stringify(expected),
  merged: merged.map((r) => r.sessionId).sort(),
  reportRows: readLedger(join(reportDir, "..", "absent.jsonl"), reportDir).length,
  reportAgree: same(onDisk(reportDir), rv.vectors.map((v: { report: string; timestamp: number }) => mine(v.report, v.timestamp))),
  matrixRows: readLedger(join(matrixDir, "..", "absent.jsonl"), matrixDir).length,
  matrixAgree: shellMatrix.length === tsMatrix.length && diffAt < 0,
  matrixDiff:
    diffAt < 0
      ? ""
      : `report ${matrix[diffAt].report}: shell wrote ${JSON.stringify(shellMatrix[diffAt])}, ledger.ts writes ${JSON.stringify(tsMatrix[diffAt])}`,
}));
TS
out="$(cd "$PROJECT_ROOT" && npx --no-install tsx "scripts/observability/$probe_name" "$VERIFIER_LEDGER_DIR" "$repo" "$vectors_dir" "$report_dir" "$matrix_dir" "$matrix_list" "$report_vectors" 2>/dev/null)" || out=""
rm -f "$PROJECT_ROOT/scripts/observability/$probe_name"

total="$(jq -r '.total // empty' <<<"$out" 2>/dev/null)"
unavail="$(jq -r '.unavailable // empty' <<<"$out" 2>/dev/null)"
names_agree="$(jq -r '.namesAgree // empty' <<<"$out" 2>/dev/null)"
merged="$(jq -c '.merged // empty' <<<"$out" 2>/dev/null)"
if [[ "$total" == "4" ]]; then
  ok "readLedger() and summarise() read the shell writer's entries ($total rows)"
else
  bad "readLedger() did not read the shell-written entries (got total=${total:-none})"
fi
# One of the four rows is verifier-unavailable, so the rate must be 0.25. This
# is what proves the STATUS survived the round trip, not just the row count.
if [[ "$unavail" == "0.25" ]]; then
  ok "the unavailable status survives into the metric"
else
  bad "unavailable rate was ${unavail:-none}, expected 0.25"
fi
if [[ "$names_agree" == "true" ]]; then
  ok "the shell writer names each file exactly as ledger.ts entryFileName() does"
else
  bad "the shell and TypeScript writers disagree on entry file names"
fi
vector_rows="$(jq -r '.vectorRows // empty' <<<"$out" 2>/dev/null)"
vector_names_agree="$(jq -r '.vectorNamesAgree // empty' <<<"$out" 2>/dev/null)"
if [[ "$vector_rows" == "$vector_total" && "$vector_names_agree" == "true" ]]; then
  ok "ledger.ts reads back all $vector_total vector entries and names each as the shell writer did"
else
  bad "vector entries: ledger.ts read ${vector_rows:-none} of $vector_total, names agree=${vector_names_agree:-none}"
fi
# The report rule, from the other side: the reader returns every entry the shell
# writer made, and ledger.ts, handed the same report, writes the same line.
report_rows="$(jq -r '.reportRows // empty' <<<"$out" 2>/dev/null)"
report_agree="$(jq -r '.reportAgree // empty' <<<"$out" 2>/dev/null)"
if [[ "$report_rows" == "$rv_total" && "$report_agree" == "true" ]]; then
  ok "ledger.ts reads back all $rv_total report-vector entries and writes each of those reports the same way"
else
  bad "report vectors: ledger.ts read ${report_rows:-none} of $rv_total, writers agree=${report_agree:-no}"
fi
matrix_rows="$(jq -r '.matrixRows // empty' <<<"$out" 2>/dev/null)"
matrix_agree="$(jq -r '.matrixAgree // empty' <<<"$out" 2>/dev/null)"
matrix_diff="$(jq -r '.matrixDiff // empty' <<<"$out" 2>/dev/null)"
if [[ "$matrix_rows" == "$matrix_total" && "$matrix_agree" == "true" ]]; then
  ok "ledger.ts reads back all $matrix_total generated entries and writes each of those reports the same way"
else
  bad "generated reports: ledger.ts read ${matrix_rows:-none} of $matrix_total, writers agree=${matrix_agree:-no} ${matrix_diff}"
fi
check "after the merge the reader returns the frozen history plus both branches" \
  '["history","session-aaaa","session-bbbb"]' "${merged:-null}"

echo
echo "passed: $pass   failed: $fail"
if (( fail > 0 )); then echo "RESULT: FAILED"; exit 1; fi
echo "RESULT: green"
