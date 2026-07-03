#!/usr/bin/env bash
# stop-handoff-nudge.sh — nudge toward /session-handoff on Stop.
#
# Runs ALONGSIDE (not instead of) stop-verifier.sh — Claude Code fires every
# registered Stop hook. This hook never blocks Stop and never runs
# session-handoff itself: a hook can only inject text via additionalContext, it
# cannot force a skill/slash-command to run (Claude Code hooks have no such
# mechanism). The running session reads the nudge and decides whether to run
# /session-handoff before actually stopping. This is a NUDGE, not a guarantee.
#
# Dedup: stays SILENT when the latest handoff is already newer than every
# un-handed-off change in the working tree — so an idle, already-handed-off
# session isn't pestered on every Stop. It only nudges when there's new work
# since the last handoff (or no handoff exists yet).
#
# Escape hatch: set CLAUDE_HANDOFF_NUDGE_SKIP=1 to silence this hook (e.g. for
# rapid iteration loops where a handoff on every Stop is noise).
#
# Stdin:  Stop-hook payload JSON (unused — nothing to parse here)
# Stdout: additionalContext JSON, or nothing
# Exit:   ALWAYS 0 (never blocks Stop)

set -uo pipefail

if [[ "${CLAUDE_HANDOFF_NUDGE_SKIP:-}" == "1" ]]; then
  exit 0
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# --- Dedup guard: skip if we already handed off and nothing changed since ---
# If a handoff exists and no working-tree change (excluding the handoff dir and
# gate logs themselves) is newer than it, the session is idle post-handoff —
# stay silent rather than re-nudge every Stop.
LATEST_HANDOFF=$(ls -t "$REPO_DIR/docs/session-handoffs"/handoff-*.md 2>/dev/null | head -1)
if [[ -n "$LATEST_HANDOFF" ]]; then
  NEWER_WORK=$(cd "$REPO_DIR" && git status --porcelain 2>/dev/null \
    | cut -c4- \
    | grep -vE '^(docs/session-handoffs/|\.handoff-logs/)' \
    | while IFS= read -r f; do
        [[ -n "$f" && -e "$f" && "$f" -nt "$LATEST_HANDOFF" ]] && { echo x; break; }
      done)
  [[ -z "$NEWER_WORK" ]] && exit 0
fi

# The Phase 0 gate (scripts/handoff-loop.sh) now ships in this repo. If it is
# ever removed or loses its exec bit, say so in the nudge so the session doesn't
# assume a gate ran when it couldn't.
GATE_NOTE=""
if [[ ! -x "$REPO_DIR/scripts/handoff-loop.sh" ]]; then
  GATE_NOTE=" Note: scripts/handoff-loop.sh is missing or not executable, so session-handoff's Phase 0 gate cannot run — write the handoff anyway using whatever verification actually ran this session."
fi

jq -n --arg ctx "Before this session ends, consider running /session-handoff — it gates the tree via scripts/handoff-loop.sh and records what was done, what shipped, and where the next session picks up (written to docs/session-handoffs/).${GATE_NOTE}" \
  '{hookSpecificOutput: {hookEventName: "Stop", additionalContext: $ctx}}'

exit 0
