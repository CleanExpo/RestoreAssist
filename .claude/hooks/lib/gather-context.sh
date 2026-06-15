#!/usr/bin/env bash
# gather-context.sh
#
# Reads a Claude Code transcript (JSONL) and extracts the context the verifier
# needs:
#   - last user message
#   - last assistant turn (text + tool-use summary)
#   - post-edit contents of every file the assistant Edit/Wrote in that turn
#
# Output: a single text blob on stdout, structured for the verifier prompt.
# Exit codes:
#   0  = context extracted successfully
#   2  = no work-bearing turn to verify (assistant turn empty, or read-only)
#   3  = transcript file unreadable / malformed
#
# Usage:  gather-context.sh <transcript_path>

set -uo pipefail

TRANSCRIPT="${1:-}"
MAX_TOKENS="${VERIFIER_MAX_CONTEXT_TOKENS:-12000}"
# Rough char-per-token approximation; conservative for code-heavy content.
MAX_CHARS=$(( MAX_TOKENS * 35 / 10 ))

if [[ -z "$TRANSCRIPT" || ! -r "$TRANSCRIPT" ]]; then
  echo "gather-context: transcript not readable: $TRANSCRIPT" >&2
  exit 3
fi

# Find the last GENUINE user prompt and everything after it (the most recent
# assistant turn). Claude Code stores tool_results as type:"user" too (array
# content of tool_result blocks), so anchoring on the last raw "user" line
# lands on a tool result and truncates the turn. A genuine prompt has string
# content, or array content with a text block and no tool_result blocks.
LAST_USER_LINE=$(jq -r '
  select(.type == "user")
  | (.message.content // .content) as $c
  | select(
      ($c|type) == "string"
      or (($c|type) == "array"
          and any($c[]?; .type=="text")
          and (any($c[]?; .type=="tool_result") | not))
    )
  | input_line_number
' "$TRANSCRIPT" 2>/dev/null | tail -n1 || true)

if [[ -z "$LAST_USER_LINE" ]]; then
  echo "gather-context: no user message in transcript" >&2
  exit 2
fi

LAST_USER_MSG=$(awk -v n="$LAST_USER_LINE" 'NR == n' "$TRANSCRIPT" \
  | jq -r '.message.content // .content // empty' 2>/dev/null \
  | jq -r 'if type == "array" then map(select(.type == "text") | .text) | join("\n") else . end' 2>/dev/null \
  || awk -v n="$LAST_USER_LINE" 'NR == n' "$TRANSCRIPT" | jq -r '.message.content // .content // ""' 2>/dev/null)

# Collect all assistant lines after LAST_USER_LINE.
ASSIST_LINES=$(awk -v n="$LAST_USER_LINE" 'NR > n' "$TRANSCRIPT" \
  | jq -c 'select(.type == "assistant")' 2>/dev/null)

if [[ -z "$ASSIST_LINES" ]]; then
  echo "gather-context: no assistant turn after last user message" >&2
  exit 2
fi

# Extract assistant text content (joined across content blocks).
ASSIST_TEXT=$(echo "$ASSIST_LINES" \
  | jq -r '.message.content // .content // empty' \
  | jq -s 'flatten | map(select(type == "object" and .type == "text") | .text) | join("\n\n")' 2>/dev/null \
  || echo "")

# Extract tool_use entries (Edit, Write, Bash, etc.).
TOOL_USES=$(echo "$ASSIST_LINES" \
  | jq -c '.message.content // .content // empty' \
  | jq -cs 'flatten | map(select(type == "object" and .type == "tool_use"))' 2>/dev/null \
  || echo "[]")

# Extract paths the assistant edited (Edit + Write tools).
EDITED_PATHS=$(echo "$TOOL_USES" \
  | jq -r '.[] | select(.name == "Edit" or .name == "Write" or .name == "MultiEdit" or .name == "NotebookEdit") | .input.file_path // .input.path // empty' \
  | sort -u)

# Skip verification when the turn produced no concrete artifact to check.
# A turn is verifiable only if the assistant edited a file. Pure read/search/
# narrative turns (Read, Glob, Grep, Bash for inspection, plain text replies)
# have no atomic claims to ground against, so the verifier returns "all
# unverified" and burns tokens for nothing.
if [[ -z "$EDITED_PATHS" ]]; then
  exit 2
fi

# ---- Emit the structured context blob ----
{
  echo "===== USER PROMPT ====="
  echo "$LAST_USER_MSG"
  echo
  echo "===== BUILDER OUTPUT (text) ====="
  echo "$ASSIST_TEXT"
  echo
  echo "===== BUILDER TOOL CALLS (summary) ====="
  echo "$TOOL_USES" | jq -r '.[] | "\(.name): \(.input | (.file_path // .path // .command // .pattern // .description // .) )"' 2>/dev/null | head -40
  echo

  if [[ -n "$EDITED_PATHS" ]]; then
    echo "===== EDITED FILES (post-edit contents) ====="
    REMAINING_BUDGET=$MAX_CHARS

    while IFS= read -r path; do
      [[ -z "$path" ]] && continue
      [[ ! -r "$path" ]] && continue
      [[ $REMAINING_BUDGET -le 200 ]] && { echo "[...remaining files truncated for token budget]"; break; }

      file_size=$(wc -c < "$path" | tr -d ' ')

      echo
      echo "----- $path ($file_size bytes) -----"
      if [[ $file_size -gt $REMAINING_BUDGET ]]; then
        # File too big — emit a head + tail slice instead.
        head_chars=$(( REMAINING_BUDGET / 2 ))
        echo "[file exceeds budget; showing head + tail slices]"
        head -c "$head_chars" "$path"
        echo
        echo "[... middle truncated ...]"
        tail -c "$(( REMAINING_BUDGET / 2 ))" "$path"
        REMAINING_BUDGET=0
      else
        cat "$path"
        REMAINING_BUDGET=$(( REMAINING_BUDGET - file_size ))
      fi
    done <<< "$EDITED_PATHS"
  fi
} 2>/dev/null

exit 0
