#!/usr/bin/env bash
# session-start-resume-nudge.sh — nudge toward /resume-from-handoff on SessionStart.
#
# Fires on "startup" and "resume" (no matcher = all SessionStart events). Only
# meaningful when a handoff actually exists to resume from; otherwise it exits
# silently so a brand-new session isn't told to resume nothing.
#
# Like stop-handoff-nudge.sh, this cannot force /resume-from-handoff to run —
# Claude Code hooks have no mechanism to compel skill invocation. It injects
# additionalContext; the new session reads it and decides. NUDGE, not guarantee.
#
# Escape hatch: set CLAUDE_HANDOFF_NUDGE_SKIP=1 to silence this hook.
#
# Stdin:  SessionStart-hook payload JSON (unused)
# Stdout: additionalContext JSON, or nothing
# Exit:   ALWAYS 0

set -uo pipefail

if [[ "${CLAUDE_HANDOFF_NUDGE_SKIP:-}" == "1" ]]; then
  exit 0
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HANDOFF_DIR="$REPO_DIR/docs/session-handoffs"

[[ -d "$HANDOFF_DIR" ]] || exit 0

LATEST=$(ls -t "$HANDOFF_DIR"/handoff-*.md 2>/dev/null | head -1)
[[ -n "$LATEST" ]] || exit 0

# Report the path relative to the repo root so it's clickable/copyable.
REL="${LATEST#"$REPO_DIR"/}"

jq -n --arg ctx "A prior session handoff exists at ${REL}. Consider running /resume-from-handoff before starting new work — it verifies current repo state against the handoff (read-only) and picks up from the documented point instead of re-deriving context." \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'

exit 0
