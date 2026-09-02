#!/usr/bin/env bash
# check.sh — run the agent-configuration evals.
#
#   bash evals/check.sh                  every case, against recorded fixtures
#   bash evals/check.sh --case <id>      one case
#   bash evals/check.sh --live           call the agent for real (costs money)
#
# WHAT THIS TESTS. Not the model. The CONFIGURATION that steers it: the skills,
# rules, CLAUDE.md and hooks under .claude/, which nothing else in this repo
# covers. See evals/README.md.
#
# THE DEAD-CHECK IS BUILT IN. Every case ships two fixtures: one answer that
# should pass, and one exhibiting the original defect that MUST fail. Running
# only the good fixture would tell you nothing -- a check that accepts a correct
# answer and also accepts the bad one is not a check. So each case is reported
# BROKEN, and the suite exits non-zero, if its failing fixture passes.
#
# Checks are deterministic regexes on purpose. A model grading another model's
# answer fails in correlated ways with the thing it is grading, and this suite
# exists to catch what a model would not notice in itself.

set -uo pipefail

EVALS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CASES_DIR="$EVALS_DIR/cases"
FIXTURES_DIR="$EVALS_DIR/fixtures"

MODE="fixture"
ONLY_CASE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --live) MODE="live"; shift ;;
    --case) ONLY_CASE="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "check.sh: unknown argument $1" >&2; exit 2 ;;
  esac
done

command -v jq >/dev/null 2>&1 || { echo "check.sh: jq is required" >&2; exit 2; }

# apply_checks <case-file> <answer-file> -> 0 if every check passes
# Prints a line per failed check. Silent on success.
apply_checks() {
  local case_file="$1" answer_file="$2" ok=0
  local total
  total=$(jq '.checks | length' "$case_file")

  for ((i = 0; i < total; i++)); do
    local kind pattern why
    kind=$(jq -r ".checks[$i].kind" "$case_file")
    pattern=$(jq -r ".checks[$i].pattern" "$case_file")
    why=$(jq -r ".checks[$i].why" "$case_file")

    # -P for Perl regex: the patterns use lookahead, which ERE cannot express.
    # A pattern that will not compile is a broken check, not a pass, so the
    # grep exit code is distinguished from a plain no-match.
    grep -Pq -- "$pattern" "$answer_file" 2>/dev/null
    local rc=$?
    if (( rc > 1 )); then
      echo "      check $i: PATTERN DID NOT COMPILE — $pattern"
      ok=1
      continue
    fi
    local matched=$((rc == 0))

    case "$kind" in
      must_match)     (( matched )) || { echo "      check $i (must_match): $why"; ok=1; } ;;
      must_not_match) (( matched )) && { echo "      check $i (must_not_match): $why"; ok=1; } ;;
      *) echo "      check $i: unknown kind '$kind'"; ok=1 ;;
    esac
  done
  return $ok
}

# answer_for <case-id> <variant> -> path to the answer text
answer_for() {
  local id="$1" variant="$2"
  if [[ "$MODE" == "live" && "$variant" == "pass" ]]; then
    local prompt out
    prompt=$(jq -r '.prompt' "$CASES_DIR/$id.json")
    out="$(mktemp)"
    # The agent under test. `claude -p` reuses the repo's own configuration,
    # which is the point: the eval measures .claude/, not a bare model.
    if ! printf '%s' "$prompt" | claude -p --output-format text > "$out" 2>/dev/null; then
      echo "" > "$out"
    fi
    printf '%s' "$out"
    return
  fi
  printf '%s' "$FIXTURES_DIR/$id.$variant.txt"
}

pass=0; fail=0; broken=0
mapfile -t case_files < <(find "$CASES_DIR" -name '*.json' | sort)

if (( ${#case_files[@]} == 0 )); then
  echo "check.sh: no cases found in $CASES_DIR" >&2
  exit 2
fi

for case_file in "${case_files[@]}"; do
  id=$(jq -r '.id' "$case_file")
  [[ -n "$ONLY_CASE" && "$id" != "$ONLY_CASE" ]] && continue
  title=$(jq -r '.title' "$case_file")

  echo "== $id"
  echo "   $title"

  # --- the good answer must pass ---
  good="$(answer_for "$id" pass)"
  if [[ ! -r "$good" ]]; then
    echo "   BROKEN: no passing fixture at $good"
    broken=$((broken + 1)); continue
  fi
  if apply_checks "$case_file" "$good"; then
    echo "   ok    the good answer passes"
    pass=$((pass + 1))
  else
    echo "   FAIL  the good answer was rejected"
    fail=$((fail + 1))
  fi

  # --- the defective answer MUST fail ---
  # This is the dead-check. Without it the suite could be all-green while every
  # check matched nothing at all.
  bad="$FIXTURES_DIR/$id.fail.txt"
  if [[ ! -r "$bad" ]]; then
    echo "   BROKEN: no failing fixture at $bad — the checks are unproven"
    broken=$((broken + 1)); continue
  fi
  if apply_checks "$case_file" "$bad" > /dev/null; then
    echo "   BROKEN: the DEFECTIVE answer also passes — this case tests nothing"
    broken=$((broken + 1))
  else
    echo "   ok    the defective answer is rejected"
  fi
done

echo
echo "cases passed: $pass   failed: $fail   broken: $broken   (mode: $MODE)"
if (( fail > 0 || broken > 0 )); then
  echo "RESULT: FAILED"
  exit 1
fi
echo "RESULT: green — every check shown to reject the defect it was written for"
