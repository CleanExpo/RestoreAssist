#!/usr/bin/env bash
# run-panel.sh — ask every enabled seat to review a diff, collect their answers.
#
#   bash scripts/ci/review-panel/run-panel.sh <diff-file> > results.json
#
# Output: a JSON array of SeatResult (see panel.ts), ready to pipe into
# summarise.ts, which does the merging and writes the PR comment.
#
# COST. Every seat enabled in roster.json is an OpenRouter `:free` variant, which
# structurally cannot bill — the same invariant that lets the Stop-hook verifier
# share the platform key (lib/ai/openrouter.ts). Paid seats ship disabled and
# need an owner spend decision (rule 31). This script refuses to enable one for
# you: a seat runs only if roster.json says enabled AND its required env var is
# present.
#
# A SEAT THAT FAILS IS ABSENT, NOT AGREEMENT. Every failure is recorded with its
# reason and carried through to the report, because a panel that silently drops a
# dead seat reports one opinion as a consensus.

set -uo pipefail

DIFF_FILE="${1:-}"
if [[ -z "$DIFF_FILE" || ! -r "$DIFF_FILE" ]]; then
  echo "usage: run-panel.sh <diff-file>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ROSTER="$SCRIPT_DIR/roster.json"
REVIEW_MD="$REPO_ROOT/REVIEW.md"
DIMENSIONS_MD="$REPO_ROOT/.claude/rules/review-dimensions.md"

for required in "$ROSTER" "$REVIEW_MD" "$DIMENSIONS_MD"; do
  [[ -r "$required" ]] || { echo "run-panel: missing $required" >&2; exit 2; }
done

# Cap the diff. A seat that is handed more than its context window returns
# nothing useful, and truncation that nobody is told about is a silent partial
# review — so when it happens, it is stated in the output and in the report.
MAX_DIFF_BYTES="${PANEL_MAX_DIFF_BYTES:-120000}"
DIFF_BYTES=$(wc -c < "$DIFF_FILE")
TRUNCATED=false
if (( DIFF_BYTES > MAX_DIFF_BYTES )); then
  TRUNCATED=true
fi

build_prompt() {
  {
    cat "$REVIEW_MD"
    printf '\n\n---\n\n# Dimension reference\n\n'
    cat "$DIMENSIONS_MD"
    printf '\n\n---\n\n# The diff to review\n\n'
    if [[ "$TRUNCATED" == true ]]; then
      printf 'NOTE: this diff was truncated at %s bytes of %s. Review only what is shown, and do not infer anything about the omitted part.\n\n' \
        "$MAX_DIFF_BYTES" "$DIFF_BYTES"
      head -c "$MAX_DIFF_BYTES" "$DIFF_FILE"
    else
      cat "$DIFF_FILE"
    fi
    printf '\n\nRespond with the strict JSON object REVIEW.md specifies. No prose around it.\n'
  }
}

PROMPT_FILE="$(mktemp)"
SYSTEM_FILE="$(mktemp)"
trap 'rm -f "$PROMPT_FILE" "$SYSTEM_FILE"' EXIT
build_prompt > "$PROMPT_FILE"
printf 'You are one seat on a multi-model code review panel for RestoreAssist. Follow REVIEW.md exactly. Report only what you can support from the diff shown. An empty findings array is a valid and common answer; do not manufacture a finding to look useful.\n' > "$SYSTEM_FILE"

seat_count=$(jq '[.seats[] | select(.enabled == true)] | length' "$ROSTER")
if (( seat_count == 0 )); then
  echo "run-panel: no seats enabled in roster.json" >&2
  exit 2
fi

results="[]"

while IFS=$'\t' read -r id family provider model base_url requires_env; do
  # A seat needing a key it does not have is a failed seat, reported as such.
  if [[ -n "$requires_env" && "$requires_env" != "null" && -z "${!requires_env:-}" ]]; then
    results=$(jq --arg s "$id" --arg f "$family" --arg e "$requires_env is not set" \
      '. + [{seat:$s, family:$f, findings:[], error:$e}]' <<<"$results")
    continue
  fi

  api_base="$base_url"
  [[ -z "$api_base" || "$api_base" == "null" ]] && api_base="https://openrouter.ai/api/v1"

  # Reuse the existing caller rather than writing a second HTTP client. It
  # already resolves keys in a documented order, retries, and enforces the
  # `:free` pin against OpenRouter.
  raw=$(VERIFIER_API_BASE="$api_base" \
        VERIFIER_MODEL_ID="$model" \
        VERIFIER_PROMPT_FILE="$SYSTEM_FILE" \
        VERIFIER_MAX_OUTPUT_TOKENS="${PANEL_MAX_OUTPUT_TOKENS:-4000}" \
        VERIFIER_TIMEOUT_SECONDS="${PANEL_TIMEOUT_SECONDS:-120}" \
        bash "$REPO_ROOT/.claude/hooks/lib/openrouter-call.sh" < "$PROMPT_FILE" 2>/dev/null)
  rc=$?

  if (( rc != 0 )); then
    results=$(jq --arg s "$id" --arg f "$family" --arg e "call failed (exit $rc)" \
      '. + [{seat:$s, family:$f, findings:[], error:$e}]' <<<"$results")
    continue
  fi

  # A seat whose output will not parse has not reviewed anything. Recording it
  # as an empty findings list would turn a broken seat into a clean bill.
  if ! findings=$(jq -e '.findings // empty' <<<"$raw" 2>/dev/null); then
    results=$(jq --arg s "$id" --arg f "$family" --arg e "response was not the expected JSON shape" \
      '. + [{seat:$s, family:$f, findings:[], error:$e}]' <<<"$results")
    continue
  fi

  results=$(jq --arg s "$id" --arg f "$family" --argjson fs "$findings" \
    '. + [{seat:$s, family:$f, findings:$fs}]' <<<"$results")
done < <(jq -r '.seats[] | select(.enabled == true)
                | [.id, .family, .provider, .model, (.baseUrl // ""), (.requiresEnv // "")]
                | @tsv' "$ROSTER")

jq -n --argjson r "$results" --argjson t "$TRUNCATED" \
  '{diffTruncated: $t, results: $r}'
