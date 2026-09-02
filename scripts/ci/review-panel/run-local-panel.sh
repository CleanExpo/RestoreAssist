#!/usr/bin/env bash
# run-local-panel.sh — the five-family panel, run on your own machine.
#
#   bash scripts/ci/review-panel/run-local-panel.sh            # review vs origin/main
#   bash scripts/ci/review-panel/run-local-panel.sh <diff-file>
#
# WHY THIS EXISTS SEPARATELY FROM run-panel.sh. Two of the strongest opinions
# available cost nothing on a laptop and cannot be had in CI at all:
#
#   - Codex CLI signed in with a ChatGPT plan. Codex is included with Plus, Pro,
#     Business, Edu and Enterprise, so `codex exec` draws on plan limits rather
#     than per-token API billing. OpenAI's own guidance is that a plan is
#     licensed for interactive use by a person and automation should hold its
#     own credential, so this belongs here and not in a workflow.
#   - Claude Code signed in with a Claude plan, for the same reason.
#
# Run locally you therefore get five families — nemotron, gemma, minimax, openai
# and anthropic — where CI gets three, and the two extra ones are free.
#
# Every seat is asked the same question from REVIEW.md, and the answers go
# through the same merge, so a local run and a CI run are directly comparable.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ROSTER="$SCRIPT_DIR/roster.json"

DIFF_FILE="${1:-}"
CLEANUP_DIFF=false
if [[ -z "$DIFF_FILE" ]]; then
  DIFF_FILE="$(mktemp)"
  CLEANUP_DIFF=true
  base="${PANEL_BASE_REF:-origin/main}"
  git -C "$REPO_ROOT" diff --unified=3 "$base...HEAD" \
    -- . ':(exclude)package-lock.json' ':(exclude)**/*.snap' > "$DIFF_FILE"
  echo "reviewing $(wc -c < "$DIFF_FILE") bytes of diff against $base" >&2
fi
$CLEANUP_DIFF && trap 'rm -f "$DIFF_FILE"' EXIT

if [[ ! -s "$DIFF_FILE" ]]; then
  echo "run-local-panel: the diff is empty — nothing to review" >&2
  exit 2
fi

PROMPT_FILE="$(mktemp)"
trap 'rm -f "$PROMPT_FILE"; $CLEANUP_DIFF && rm -f "$DIFF_FILE"' EXIT
{
  cat "$REPO_ROOT/REVIEW.md"
  printf '\n\n---\n\n# Dimension reference\n\n'
  cat "$REPO_ROOT/.claude/rules/review-dimensions.md"
  printf '\n\n---\n\n# The diff to review\n\n'
  cat "$DIFF_FILE"
  printf '\n\nRespond with ONLY the strict JSON object REVIEW.md specifies. No prose, no code fences.\n'
} > "$PROMPT_FILE"

# ---- The API seats, reusing the CI runner unchanged ----
echo "== API seats ==" >&2
api_out="$(bash "$SCRIPT_DIR/run-panel.sh" "$DIFF_FILE" 2>/dev/null)"
if [[ -z "$api_out" ]]; then
  api_out='{"diffTruncated":false,"results":[]}'
fi
results="$(jq '.results' <<<"$api_out")"
truncated="$(jq '.diffTruncated' <<<"$api_out")"

# ---- The local CLI seats ----
# A seat whose binary is missing, or that is signed out, is recorded as a failed
# seat with that reason. It is never dropped: a panel that quietly shrinks from
# five families to two, and still reads as a panel, is the failure this whole
# design is built to avoid.
add_failed() {
  results="$(jq --arg s "$1" --arg f "$2" --arg e "$3" \
    '. + [{seat:$s, family:$f, findings:[], error:$e}]' <<<"$results")"
}

while IFS=$'\t' read -r id family command args_json; do
  echo "== local seat: $id ==" >&2

  if ! command -v "$command" >/dev/null 2>&1; then
    add_failed "$id" "$family" "$command is not installed on this machine"
    continue
  fi

  mapfile -t args < <(jq -r '.[]' <<<"$args_json")

  raw="$("$command" "${args[@]}" < "$PROMPT_FILE" 2>/dev/null)"
  rc=$?
  if (( rc != 0 )); then
    add_failed "$id" "$family" "$command exited $rc (signed out? try: $command login)"
    continue
  fi

  # Both CLIs wrap or annotate output depending on version and flags, so pull the
  # first well-formed JSON object carrying a `findings` array rather than
  # assuming the whole of stdout is the answer.
  findings="$(printf '%s' "$raw" \
    | sed -E 's/^```(json)?$//' \
    | jq -c -e '.findings // empty' 2>/dev/null | head -1)"

  if [[ -z "$findings" ]]; then
    add_failed "$id" "$family" "response was not the expected JSON shape"
    continue
  fi

  results="$(jq --arg s "$id" --arg f "$family" --argjson fs "$findings" \
    '. + [{seat:$s, family:$f, findings:$fs}]' <<<"$results")"
done < <(jq -r '.localSeats[]? | select(.enabled == true)
                | [.id, .family, .command, (.args | tojson)] | @tsv' "$ROSTER")

jq -n --argjson r "$results" --argjson t "$truncated" \
  '{diffTruncated: $t, results: $r}' \
  | npx --no-install tsx "$SCRIPT_DIR/summarise.ts"
