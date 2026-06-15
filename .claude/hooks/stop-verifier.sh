#!/usr/bin/env bash
# stop-verifier.sh — RestoreAssist multi-domain verifier
#
# Two-stage verification on every Stop event, dispatched per registered domain
# (see lib/domains.sh). For each domain whose path-match hits an edited file:
#   1. Static check (lib/<domain>-static-check.sh) — fast, deterministic, $0.
#      A hard violation blocks Stop immediately without calling the LLM.
#   2. LLM check (DeepSeek V4 Pro via OpenRouter) — only if static passed.
#      Catches semantic / cross-file issues the regex couldn't.
#
# Phase 1 (docs/verifier-generalization-plan.md) registers only the original
# iOS App Review domain, matching every path, so behaviour is identical to the
# pre-router hook. New domains are added in lib/domains.sh — no change here.
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
  echo "[verifier] loop guard hit (${COUNT}/${LOOP_CAP}); allowing Stop" >&2
  exit 0
fi

# ---- Extract edited paths from transcript (needed for domain matching) ----
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

# ---- Per-domain helpers ----

# Edited paths matching a domain's ERE, one per line (empty if none).
match_paths() {
  echo "$EDITED_PATHS" | grep -E "$1" || true
}

# Run one domain's two-stage check on its matched paths.
# Echoes a {"decision":"block",...} JSON and returns 1 when Stop must block;
# returns 0 to allow (move to the next domain). Never exits the process itself.
run_domain() {
  local name="$1" static_check="$2" prompt_file="$3" matched="$4"
  local ts; ts=$(date +%s)

  # ---- Stage 1: static check ----
  if [[ "$static_check" != "-" && -x "$LIB/$static_check" ]]; then
    local static_report="$REPORTS_DIR/${SESSION_ID}-${ts}-${name}-static.json"
    local static_out; static_out=$(mktemp)
    local static_rc=0
    echo "$matched" | "$LIB/$static_check" > "$static_out" 2>>"$ERROR_LOG" || static_rc=$?

    if (( static_rc == 0 )) && jq empty "$static_out" 2>/dev/null; then
      cp "$static_out" "$static_report"   # audit trail
      if [[ "$(jq -r '.status' "$static_out")" == "failed" ]]; then
        local reason
        reason=$(jq -r \
          --arg name "$name" --arg report "$static_report" '
          "Verifier [" + $name + "] (static check) found hard violations:\n\n" + (.feedback // "")
          + "\n\nFull report: " + $report
          + "\n\nFix the items above and re-state your work before stopping."
        ' "$static_out")
        jq -n --arg reason "$reason" '{decision:"block", reason:$reason}'
        rm -f "$static_out"
        return 1
      fi
    else
      log_err "session=$SESSION_ID domain=$name: static rc=$static_rc, falling through to LLM"
    fi
    rm -f "$static_out"
  fi

  # ---- Stage 2: LLM verifier (only if static passed / inconclusive) ----
  local context_file; context_file=$(mktemp)
  local gather_rc=0
  "$LIB/gather-context.sh" "$TRANSCRIPT" > "$context_file" 2>>"$ERROR_LOG" || gather_rc=$?
  if (( gather_rc != 0 )); then
    (( gather_rc != 2 )) && log_err "session=$SESSION_ID domain=$name: gather-context rc=$gather_rc"
    rm -f "$context_file"
    return 0
  fi

  local llm_report="$REPORTS_DIR/${SESSION_ID}-${ts}-${name}.json"
  local raw_out; raw_out=$(mktemp)
  local call_rc=0
  VERIFIER_PROMPT_FILE="$LIB/$prompt_file" \
    "$LIB/openrouter-call.sh" < "$context_file" > "$raw_out" 2>>"$ERROR_LOG" || call_rc=$?
  rm -f "$context_file"

  if (( call_rc != 0 )) || [[ ! -s "$raw_out" ]] || ! jq empty "$raw_out" 2>/dev/null; then
    # Verifier unavailable / malformed: record a stub and ALLOW (never block on
    # infra failure — the gate is fail-open by design).
    jq -n --arg reason "verifier [$name] unavailable" --arg rc "$call_rc" \
      --arg session "$SESSION_ID" --arg raw "$(head -c 500 "$raw_out" 2>/dev/null || true)" \
      '{status:"verifier-unavailable", reason:$reason, error_code:$rc, session_id:$session, raw_excerpt:$raw}' \
      > "$llm_report" 2>/dev/null || true
    log_err "session=$SESSION_ID domain=$name: LLM unavailable rc=$call_rc"
    rm -f "$raw_out"
    return 0
  fi
  mv "$raw_out" "$llm_report"

  local decision
  decision=$("$LIB/parse-report.sh" "$llm_report" 2>>"$ERROR_LOG") || {
    log_err "session=$SESSION_ID domain=$name: parse-report failed"
    return 0
  }
  if [[ -n "$decision" ]]; then
    echo "$decision"
    return 1
  fi
  return 0
}

# ---- Dispatch every registered domain that matches an edited path ----
# shellcheck source=lib/domains.sh
source "$LIB/domains.sh"

while IFS=$'\t' read -r D_NAME D_MATCH D_STATIC D_PROMPT; do
  [[ -z "$D_NAME" || "$D_NAME" == \#* ]] && continue
  MATCHED=$(match_paths "$D_MATCH")
  [[ -z "$MATCHED" ]] && continue

  if DECISION=$(run_domain "$D_NAME" "$D_STATIC" "$D_PROMPT" "$MATCHED"); then
    continue   # domain passed (or was fail-open) → next domain
  fi
  # Domain blocked: count one verify cycle and emit the block decision.
  echo $((COUNT + 1)) > "$COUNT_FILE" 2>/dev/null || true
  [[ -n "$DECISION" ]] && echo "$DECISION"
  exit 0
done < <(verifier_domains)

exit 0
