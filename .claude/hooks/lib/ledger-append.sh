#!/usr/bin/env bash
# ledger-append.sh — record one verification in the durable metrics ledger.
#
# Sourced by stop-verifier.sh. Called once per report the hook writes.
#
# WHY THIS EXISTS. The reports themselves land in .claude/verifier-reports/,
# which is in .gitignore. The 151 tracked files there are only tracked because
# they predate that rule; no new report will ever be committed, so the signal is
# discarded on every fresh clone. scripts/observability/ needs a series that
# GROWS, and sweeping a gitignored directory afterwards only works on a machine
# that still happens to have it. Capturing at the point of production is the fix
# docs/observability/README.md named as the next step.
#
# THE LINE SHAPE MUST MATCH collect-verifier-metrics.ts EXACTLY. Both write to
# the same file and verifier-metrics.ts reads both without knowing which wrote
# which, so an extra key or a null where the TypeScript omits the field would
# make the two producers disagree about the same event. JSON.stringify drops
# undefined, so the terse report shape carries four keys and the full one seven.
#
# THIS NEVER FAILS THE HOOK. Every path swallows its errors and returns 0. A
# metrics write that could block a Stop would be a worse defect than the missing
# metric it was added to fix.

# ledger_append <report-json-file> <session-id> <timestamp> <domain>
ledger_append() {
  local report="$1" session="$2" ts="$3" domain="$4"

  [[ "${VERIFIER_LEDGER_SKIP:-}" == "1" ]] && return 0
  [[ -r "$report" ]] || return 0

  # REPO_DIR is .claude/; the ledger lives beside the code that reads it.
  local ledger="${VERIFIER_LEDGER_PATH:-$(cd "$REPO_DIR/.." 2>/dev/null && pwd)/scripts/observability/verifier-ledger.jsonl}"
  [[ -d "$(dirname "$ledger")" ]] || return 0

  local line
  line=$(jq -c -n \
    --arg s "$session" \
    --argjson t "$ts" \
    --arg d "$domain" \
    --slurpfile r "$report" '
      ($r[0] // {}) as $body
      | {sessionId: $s, timestamp: $t, domain: $d, status: (($body.status // "unknown") | tostring)}
      + (if ($body.claims_total   | type) == "number" then {claimsTotal:  $body.claims_total}   else {} end)
      + (if ($body.claims_failed  | type) == "number" then {claimsFailed: $body.claims_failed}  else {} end)
      + (if ($body.claims_warned  | type) == "number" then {claimsWarned: $body.claims_warned}  else {} end)
    ' 2>/dev/null) || return 0

  [[ -n "$line" ]] || return 0

  # A single short line through >> is atomic on POSIX below PIPE_BUF (4096), and
  # these are around 150 bytes, so two domains finishing at once cannot interleave.
  printf '%s\n' "$line" >> "$ledger" 2>/dev/null || true
  return 0
}
