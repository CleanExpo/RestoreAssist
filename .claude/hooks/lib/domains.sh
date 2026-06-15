#!/usr/bin/env bash
# domains.sh — verifier domain registry (Phase 1 of the verifier generalization
# plan, docs/verifier-generalization-plan.md).
#
# Each line registers one verifier domain:
#   name | path_match (grep -E regex) | static_check | prompt_file
#
#   name         short id, appears in report filenames and block messages
#   path_match   ERE matched against each edited path; the domain runs only on
#                its matching paths. "." matches every path.
#   static_check script in lib/ run first ($0, deterministic); "-" to skip
#   prompt_file  system prompt in lib/ for the LLM stage
#
# Order matters: domains run top-to-bottom; the first domain whose static check
# hard-fails blocks the Stop. Add new domains by appending a line + the two
# referenced files — no change to stop-verifier.sh.
#
# Phase 1 registers only the original iOS App Review verifier, matching every
# path ("."), so behaviour is identical to the pre-router hook. Phase 2 appends
# migration-safety and claim-truthfulness (see the plan).
verifier_domains() {
  cat <<'EOF'
ios-app-review|.|ios-static-check.sh|verifier-system-prompt.md
EOF
}
