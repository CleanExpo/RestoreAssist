#!/usr/bin/env bash
# parse-report.sh
#
# Reads a JSON verifier report from stdin (or a file path argument) and emits
# a Claude Code Stop-hook decision on stdout.
#
# Decision shapes:
#   verified  → no stdout (allow Stop), echo summary to stderr, exit 0
#   partial   → no stdout (allow Stop), echo warning to stderr, exit 0
#   failed    → emit {"decision":"block","reason":"..."} on stdout, exit 0
#
# Exit code is always 0 unless the report itself is malformed (then 6).
#
# Usage:
#   parse-report.sh <report-path>
#   parse-report.sh < report.json

set -uo pipefail

REPORT_PATH="${1:-}"

if [[ -n "$REPORT_PATH" && -r "$REPORT_PATH" ]]; then
  REPORT=$(cat "$REPORT_PATH")
else
  REPORT=$(cat)
fi

if [[ -z "$REPORT" ]]; then
  echo "parse-report: empty input" >&2
  exit 6
fi

if ! echo "$REPORT" | jq empty 2>/dev/null; then
  echo "parse-report: input is not valid JSON" >&2
  exit 6
fi

STATUS=$(echo "$REPORT" | jq -r '.status // empty')
TOTAL=$(echo "$REPORT" | jq -r '.claims_total // 0')
VERIFIED_N=$(echo "$REPORT" | jq -r '.claims_verified // 0')
FAILED_N=$(echo "$REPORT" | jq -r '.claims_failed // 0')
UNVERIFIED_N=$(echo "$REPORT" | jq -r '.claims_unverified // 0')

case "$STATUS" in
  verified)
    echo "[verifier] ✓ ${VERIFIED_N}/${TOTAL} claims verified${REPORT_PATH:+ (report: $REPORT_PATH)}" >&2
    exit 0
    ;;
  partial)
    echo "[verifier] ⚠ partial: ${VERIFIED_N}/${TOTAL} verified, ${UNVERIFIED_N} unverified${REPORT_PATH:+ (report: $REPORT_PATH)}" >&2
    exit 0
    ;;
  failed)
    FEEDBACK=$(echo "$REPORT" | jq -r '.feedback // "(no feedback field provided)"')
    REASON="Verifier (DeepSeek V4 Pro) flagged ${FAILED_N}/${TOTAL} claims as failed.

${FEEDBACK}"
    if [[ -n "$REPORT_PATH" ]]; then
      REASON="${REASON}

Full report: ${REPORT_PATH}"
    fi
    REASON="${REASON}

Fix the items above and re-state your work before stopping."

    jq -n --arg reason "$REASON" '{decision: "block", reason: $reason}'
    exit 0
    ;;
  *)
    echo "parse-report: unknown status '$STATUS', allowing Stop" >&2
    exit 0
    ;;
esac
