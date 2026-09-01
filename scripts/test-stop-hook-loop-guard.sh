#!/usr/bin/env bash
# test-stop-hook-loop-guard.sh — regression test for the Stop-hook block loop.
#
# The failure this guards against: Claude Code aborts a turn with
#   "A hook blocked the turn from ending N consecutive times"
# when a Stop hook keeps returning {"decision":"block"} for the same turn.
#
# claim-truthfulness is the domain that makes this unrecoverable on its own:
# it greps the CURRENT turn's assistant text for an unbacked "tests pass"
# claim. Once that text is in the transcript it cannot be un-said, so every
# re-stop in the same turn re-detects it and blocks again — forever, unless
# the hook honours stop_hook_active.
#
# Run: bash scripts/test-stop-hook-loop-guard.sh
# Exit 0 = all cases pass.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$REPO_DIR/.claude/hooks/stop-verifier.sh"
REPORTS_DIR="$REPO_DIR/.claude/verifier-reports"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"; rm -f "$REPORTS_DIR"/loopguard-*.count "$REPORTS_DIR"/loopguard-*-*.json' EXIT

FAILURES=0
pass() { echo "  ok   — $1"; }
fail() { echo "  FAIL — $1"; FAILURES=$((FAILURES + 1)); }

# A transcript whose final turn edits a file and asserts tests pass with no
# Bash call — exactly what claim-truthfulness blocks on.
TRANSCRIPT="$TMP/transcript.jsonl"
cat > "$TRANSCRIPT" <<'EOF'
{"type":"user","message":{"content":"fix the failing helper"}}
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"lib/foo.ts"}}]}}
{"type":"assistant","message":{"content":[{"type":"text","text":"Fixed it. All tests pass."}]}}
EOF

# Each case gets its own session id so the on-disk counter starts clean.
run_hook() { # $1 = session id, $2 = stop_hook_active ("true"/"false")
  jq -n --arg s "$1" --arg t "$TRANSCRIPT" --argjson a "$2" \
    '{session_id:$s, transcript_path:$t, stop_hook_active:$a}' \
    | "$HOOK" 2>/dev/null
}
blocked() { [[ "$(echo "${1:-}" | jq -r '.decision // "allow"' 2>/dev/null)" == "block" ]]; }

echo "case 1: an unbacked pass-claim blocks the first Stop"
OUT=$(run_hook "loopguard-1" false)
if blocked "$OUT"; then pass "first Stop blocked"; else fail "expected a block, got: ${OUT:-<empty>}"; fi

echo "case 2: stop_hook_active=true always allows (CLI recursion guard)"
OUT=$(run_hook "loopguard-2" true)
if blocked "$OUT"; then
  fail "hook blocked while stop_hook_active=true — this is the N-consecutive-blocks loop"
else
  pass "allowed while a Stop hook is already driving the turn"
fi

echo "case 3: repeated Stops in one turn never exceed the loop cap"
BLOCKS=0
for _ in 1 2 3 4 5 6 7 8 9; do
  # After the first block the CLI sets stop_hook_active on every subsequent
  # Stop of the same turn — replay that faithfully.
  if (( BLOCKS == 0 )); then ACTIVE=false; else ACTIVE=true; fi
  OUT=$(run_hook "loopguard-3" "$ACTIVE")
  blocked "$OUT" && BLOCKS=$((BLOCKS + 1))
done
CAP="${VERIFIER_LOOP_CAP:-2}"
if (( BLOCKS <= CAP )); then
  pass "$BLOCKS block(s) across 9 Stops (cap $CAP)"
else
  fail "$BLOCKS blocks across 9 Stops — exceeds cap $CAP"
fi

echo "case 4: a counter that cannot be persisted fails open"
# Simulate an unwritable reports dir by pointing the counter at a path the
# hook cannot create (a file where a directory must be).
BADDIR="$TMP/not-a-dir"
: > "$BADDIR"
OUT=$(VERIFIER_REPORTS_DIR="$BADDIR/reports" run_hook "loopguard-4" false)
if blocked "$OUT"; then
  fail "blocked with no way to persist the counter — nothing bounds the loop"
else
  pass "allowed Stop rather than blocking unbounded"
fi

echo
if (( FAILURES == 0 )); then
  echo "stop-hook loop guard: all cases pass"
  exit 0
fi
echo "stop-hook loop guard: $FAILURES case(s) failed"
exit 1
