#!/usr/bin/env bash
# stop-verifier.sh — RestoreAssist iOS App Review verifier
#
# Two-stage verification on every Stop event:
#   1. Static check (ios-static-check.sh) — fast, deterministic, $0
#      Runs grep-based rules grounded in actual rejection patterns. If it
#      finds a hard violation, blocks Stop immediately without calling LLM.
#   2. LLM check (DeepSeek V4 Pro via OpenRouter) — only if static passed.
#      Catches semantic / cross-file issues the regex couldn't.
#
# Stdin: Stop-hook payload JSON
# Stdout: empty (allow Stop) OR {"decision":"block","reason":"..."}
# Exit: ALWAYS 0.

set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HOOK_DIR/lib"
REPO_DIR="$(cd "$HOOK_DIR/.." && pwd)"   # .claude/
REPORTS_DIR="$REPO_DIR/verifier-reports"
ERROR_LOG="$REPORTS_DIR/_hook-errors.log"
LOOP_CAP="${VERIFIER_LOOP_CAP:-2}"

mkdir -p "$REPORTS_DIR" 2>/dev/null || true

log_err() {
  echo "[$(date -u +%FT%TZ)] $*" >> "$ERROR_LOG" 2>/dev/null || true
}

trap 'log_err "stop-verifier: unhandled error at line $LINENO"' ERR

# ---- Escape hatches ----
if [[ "${CLAUDE_VERIFIER_SKIP:-}" == "1" ]]; then
  exit 0
fi

# ---- Read Stop-hook payload ----
PAYLOAD=$(cat)
[[ -z "$PAYLOAD" ]] && { log_err "empty stdin payload"; exit 0; }

SESSION_ID=$(echo "$PAYLOAD" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")
TRANSCRIPT=$(echo "$PAYLOAD" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")

if [[ -z "$TRANSCRIPT" || ! -r "$TRANSCRIPT" ]]; then
  log_err "session=$SESSION_ID: transcript not readable: $TRANSCRIPT"
  exit 0
fi

# ---- Loop guard ----
COUNT_FILE="$REPORTS_DIR/${SESSION_ID}.count"
COUNT=0
if [[ -r "$COUNT_FILE" ]]; then
  COUNT=$(cat "$COUNT_FILE" 2>/dev/null | tr -d '[:space:]')
  [[ -z "$COUNT" ]] && COUNT=0
fi
if (( COUNT >= LOOP_CAP )); then
  echo "[ios-verifier] loop guard hit (${COUNT}/${LOOP_CAP}); allowing Stop" >&2
  exit 0
fi

# ---- Extract edited paths from transcript (we need them for the static check) ----
EDITED_PATHS=$(jq -r '
  select(.type == "assistant")
  | .message.content // .content
  | select(. != null)
  | (if type == "array" then . else [] end)
  | map(select(.type == "tool_use" and (.name | IN("Edit","Write","MultiEdit","NotebookEdit"))))
  | .[].input | (.file_path // .path // empty)
' "$TRANSCRIPT" 2>/dev/null | sort -u || true)

if [[ -z "$EDITED_PATHS" ]]; then
  # Nothing was edited — nothing to verify. Pure read/narrative turn.
  exit 0
fi

# ---- Stage 1: Static check ----
TS=$(date +%s)
STATIC_REPORT="$REPORTS_DIR/${SESSION_ID}-${TS}-static.json"

STATIC_OUTPUT=$(mktemp)
STATIC_RC=0
echo "$EDITED_PATHS" | "$LIB/ios-static-check.sh" > "$STATIC_OUTPUT" 2>>"$ERROR_LOG" || STATIC_RC=$?

if (( STATIC_RC != 0 )) || ! jq empty "$STATIC_OUTPUT" 2>/dev/null; then
  log_err "session=$SESSION_ID: static check rc=$STATIC_RC, falling through to LLM"
  rm -f "$STATIC_OUTPUT"
else
  # Persist the static report for the audit trail.
  cp "$STATIC_OUTPUT" "$STATIC_REPORT"

  STATIC_STATUS=$(jq -r '.status' "$STATIC_OUTPUT")

  if [[ "$STATIC_STATUS" == "failed" ]]; then
    # Hard violation — block immediately, skip LLM.
    REASON=$(jq -r '
      "iOS App Review verifier (static check) found hard violations:\n\n" + .feedback
      + "\n\nFull report: '"$STATIC_REPORT"'"
      + "\n\nFix the items above and re-state your work before stopping."
    ' "$STATIC_OUTPUT")
    jq -n --arg reason "$REASON" '{decision:"block", reason:$reason}'
    echo $((COUNT + 1)) > "$COUNT_FILE" 2>/dev/null || true
    rm -f "$STATIC_OUTPUT"
    exit 0
  fi

  rm -f "$STATIC_OUTPUT"
  # static-clean or partial → fall through to LLM check.
fi

# ---- Stage 2: LLM verifier (only if static passed / inconclusive) ----

# Build context using the shared gather-context script.
CONTEXT_FILE=$(mktemp)
GATHER_RC=0
"$LIB/gather-context.sh" "$TRANSCRIPT" > "$CONTEXT_FILE" 2>>"$ERROR_LOG" || GATHER_RC=$?

case $GATHER_RC in
  0) ;;  # context gathered
  2) rm -f "$CONTEXT_FILE"; exit 0 ;;  # nothing to verify (defensive)
  *)
    log_err "session=$SESSION_ID: gather-context failed rc=$GATHER_RC"
    rm -f "$CONTEXT_FILE"
    exit 0
    ;;
esac

LLM_REPORT="$REPORTS_DIR/${SESSION_ID}-${TS}.json"
RAW_OUTPUT=$(mktemp)
CALL_RC=0
"$LIB/openrouter-call.sh" < "$CONTEXT_FILE" > "$RAW_OUTPUT" 2>>"$ERROR_LOG" || CALL_RC=$?
rm -f "$CONTEXT_FILE"

write_stub() {
  local reason="$1" raw_excerpt
  raw_excerpt=$(head -c 500 "$RAW_OUTPUT" 2>/dev/null || true)
  jq -n \
    --arg reason "$reason" \
    --arg session "$SESSION_ID" \
    --arg rc "$CALL_RC" \
    --arg raw "$raw_excerpt" \
    '{status:"verifier-unavailable", reason:$reason, error_code:$rc, session_id:$session, raw_excerpt:$raw}' \
    > "$LLM_REPORT" 2>/dev/null || true
}

if (( CALL_RC != 0 )); then
  write_stub "openrouter-call exited with rc=$CALL_RC"
  log_err "session=$SESSION_ID: openrouter-call rc=$CALL_RC"
  echo "[ios-verifier] LLM unavailable (rc=$CALL_RC); allowing Stop. See $ERROR_LOG" >&2
  rm -f "$RAW_OUTPUT"
  exit 0
fi
if [[ ! -s "$RAW_OUTPUT" ]]; then
  write_stub "empty response from verifier"
  log_err "session=$SESSION_ID: empty LLM response"
  rm -f "$RAW_OUTPUT"
  exit 0
fi
if ! jq empty "$RAW_OUTPUT" 2>/dev/null; then
  write_stub "verifier returned non-JSON"
  log_err "session=$SESSION_ID: non-JSON LLM response"
  rm -f "$RAW_OUTPUT"
  exit 0
fi

mv "$RAW_OUTPUT" "$LLM_REPORT"

DECISION=$("$LIB/parse-report.sh" "$LLM_REPORT" 2>>"$ERROR_LOG")
PARSE_RC=$?
if (( PARSE_RC != 0 )); then
  log_err "session=$SESSION_ID: parse-report rc=$PARSE_RC"
  exit 0
fi

if [[ -n "$DECISION" ]]; then
  echo $((COUNT + 1)) > "$COUNT_FILE" 2>/dev/null || true
  echo "$DECISION"
fi

exit 0
