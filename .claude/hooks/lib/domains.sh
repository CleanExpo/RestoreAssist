#!/usr/bin/env bash
# domains.sh — verifier domain registry (Phase 1 of the verifier generalization
# plan, docs/verifier-generalization-plan.md).
#
# Each domain is one TAB-separated record (tab, not '|', because path_match
# regexes contain '|' for alternation):
#   name <TAB> path_match (grep -E regex) <TAB> static_check <TAB> prompt_file
#
#   name         short id, appears in report filenames and block messages
#   path_match   ERE matched against each edited path; the domain runs only on
#                its matching paths. "." matches every path.
#   static_check script in lib/ run first ($0, deterministic); "-" to skip
#   prompt_file  system prompt in lib/ for the LLM stage
#
# Order matters: domains run top-to-bottom; the first domain whose static check
# hard-fails blocks the Stop. Add new domains by appending a printf line + the
# two referenced files — no change to stop-verifier.sh. The dispatch reads these
# with IFS=$'\t'.
#
# Phase 1 registered only the iOS App Review verifier (matching every path ".")
# for behaviour-identical rollout. Phase 2 adds migration-safety. Next:
# claim-truthfulness (see docs/verifier-generalization-plan.md).
verifier_domains() {
  printf '%s\t%s\t%s\t%s\n' ios-app-review '.' ios-static-check.sh verifier-system-prompt.md
  printf '%s\t%s\t%s\t%s\n' migration-safety '(prisma|supabase)/migrations/' migration-static-check.sh verifier-migration-safety.md
  printf '%s\t%s\t%s\t%s\n' claim-truthfulness '.' claim-truthfulness-static-check.sh -
}
