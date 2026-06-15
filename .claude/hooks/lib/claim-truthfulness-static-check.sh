#!/usr/bin/env bash
# claim-truthfulness-static-check.sh
#
# Deterministic, $0. Catches the highest-precision form of "built but doesn't
# work": the final assistant turn ASSERTS that tests / CI / the build PASS, but
# the turn ran ZERO Bash commands — nothing was actually executed to back it.
# This is the structural answer to the "board says built, reality differs"
# failure mode (2026-06-10 Plaud mandate, RA-6461).
#
# Reads the transcript path as $1 (stdin = edited paths, ignored here). The
# "turn" is every assistant line after the last user message — so a normal
# run-tests-then-report flow has its Bash call in scope and passes.
#
# Output (stdout): JSON in the shape stop-verifier.sh expects.
#   - claim present + zero Bash this turn → status:"failed"
#   - otherwise                           → status:"static-clean"
# Exit 0 always; the hook decides.

set -uo pipefail

TRANSCRIPT="${1:-}"
clean() { jq -n --arg r "$1" '{status:"static-clean", reason:$r}'; exit 0; }

[[ -z "$TRANSCRIPT" || ! -r "$TRANSCRIPT" ]] && clean "no transcript"

# Final assistant turn = all assistant lines after the last GENUINE user prompt.
# In Claude Code transcripts tool_results are ALSO type:"user" (array content
# of tool_result blocks); anchoring on the last "user" line lands on a tool
# result, not the human prompt, and hides the turn's Bash calls. A genuine
# prompt has string content, or array content with a text block and no
# tool_result blocks.
LAST_USER=$(jq -r '
  select(.type=="user")
  | (.message.content // .content) as $c
  | select(
      ($c|type) == "string"
      or (($c|type) == "array"
          and any($c[]?; .type=="text")
          and (any($c[]?; .type=="tool_result") | not))
    )
  | input_line_number
' "$TRANSCRIPT" 2>/dev/null | tail -n1)
[[ -z "$LAST_USER" ]] && clean "no genuine user message"

ASSIST=$(awk -v n="$LAST_USER" 'NR>n' "$TRANSCRIPT" | jq -c 'select(.type=="assistant")' 2>/dev/null)
[[ -z "$ASSIST" ]] && clean "no assistant turn"

TEXT=$(echo "$ASSIST" | jq -r '.message.content // empty' \
  | jq -rs 'flatten | map(select(type=="object" and .type=="text") | .text) | join("\n")' 2>/dev/null || echo "")
TOOLS=$(echo "$ASSIST" | jq -r '.message.content // empty' \
  | jq -rs 'flatten | map(select(type=="object" and .type=="tool_use") | .name) | join(" ")' 2>/dev/null || echo "")

# Assertions that something was executed and passed. Deliberately narrow to keep
# false positives near zero — only unambiguous pass-claims.
CLAIM_RE='tests?[[:space:]]+(now[[:space:]]+)?(pass|passing|are[[:space:]]+green|green)'
CLAIM_RE+='|all[[:space:]]+tests?[[:space:]]+(pass|passing|green)'
CLAIM_RE+='|ci[[:space:]]+(is[[:space:]]+)?green'
CLAIM_RE+='|build[[:space:]]+(passes|succeeds|is[[:space:]]+green)'
CLAIM_RE+='|[0-9]+/[0-9]+[[:space:]]+(tests?[[:space:]]+)?(pass|passing|green)'
CLAIM_RE+='|(test[[:space:]]+)?suite[[:space:]]+(is[[:space:]]+)?green'

if echo "$TEXT" | grep -iqE "$CLAIM_RE" && ! echo " $TOOLS " | grep -q ' Bash '; then
  ev=$(echo "$TEXT" | grep -ioE "$CLAIM_RE" | head -n1)
  jq -n --arg ev "$ev" \
    --arg fb "You asserted tests/CI/build pass, but this turn ran zero Bash commands — nothing was executed to produce that result. Run the test/CI command and cite its output, or remove the claim before stopping." \
    '{status:"failed", confidence:"high", claims_total:1, claims_verified:0, claims_failed:1, claims_unverified:0,
      failed:[{claim:"Asserted tests/CI/build pass without executing anything", evidence:$ev,
               why:"No Bash tool call in this turn to produce the cited pass result.", rule:"1"}],
      feedback:$fb}'
  exit 0
fi

clean "no unbacked pass-claim"
