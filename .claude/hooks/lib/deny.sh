#!/usr/bin/env bash
# deny.sh — the one place that knows how to answer a PreToolUse hook.
#
# Sourced by the PreToolUse guards. Kept separate so both guards emit the same
# shape and a change to the protocol is a change to one file.
#
# The protocol (docs: code.claude.com/docs/en/hooks):
#   - input arrives as JSON on stdin, NOT in environment variables
#   - a decision is JSON on stdout: hookSpecificOutput.permissionDecision
#   - exit 2 also blocks; exit 0 with no output means "no decision, carry on"
#   - exit 1 is a NON-BLOCKING hook error. It prints and the tool call proceeds.
#
# That last line is not trivia. The guards this file replaces used exit 1 while
# printing the word "BLOCKED", so for as long as they existed they announced a
# block they were not performing. See .claude/hooks/tests/test-guards.sh.

# deny <reason> — refuse the tool call and tell Claude why.
deny() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# allow — no decision; the normal permission flow applies.
# Staying silent does not approve the call, it only declines to object.
allow() {
  exit 0
}

# hook_payload — read the event JSON from stdin.
hook_payload() {
  cat
}

# field <payload> <jq-path> — pull one field, empty string if absent.
field() {
  printf '%s' "$1" | jq -r "$2 // empty" 2>/dev/null || printf ''
}
