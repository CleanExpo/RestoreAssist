#!/usr/bin/env bash
# pre-edit-sensitive.sh — PreToolUse(Edit|Write|NotebookEdit): keep secrets out of the diff.
#
# Replaces the inline guard from .claude/settings.local.json, which read
# $CLAUDE_FILE_PATH (never set) and exited 1 (never blocks). Same two defects as
# its sibling; .claude/hooks/tests/test-guards.sh holds the proof.
#
# Patterns live in a paired array for the reason documented in
# pre-bash-destructive.sh: a `|`-delimited table truncates every regex that uses
# alternation, which is nearly all of these.
#
# The path arrives under a different key depending on the tool, so each plausible
# key is read rather than assuming one shape.
#
# Stdin:  PreToolUse payload JSON
# Stdout: a permissionDecision, or nothing
# Exit:   always 0

set -uo pipefail
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deny.sh
source "$HOOK_DIR/lib/deny.sh"

PAYLOAD="$(hook_payload)"
PATH_ARG="$(field "$PAYLOAD" '.tool_input.file_path // .tool_input.path // .tool_input.notebook_path')"
[[ -z "$PATH_ARG" ]] && allow

base="${PATH_ARG##*/}"

# Example and template files are the documented shape of a secret, not a secret.
# Without this the guard blocks the one file a new contributor must be able to
# read and copy.
case "$base" in
  *.example|*.sample|*.template|*.dist) allow ;;
esac

PATTERNS=(
  '(^|/)\.env($|\.|/)'
  '.env files hold live credentials'

  '(^|/)\.npmrc$'
  '.npmrc can carry a registry auth token'

  '(^|/)\.netrc$'
  '.netrc holds plaintext login credentials'

  '\.(pem|key|p12|pfx|jks|keystore)$'
  'private keys and keystores must never enter the tree'

  '(^|/)(id_rsa|id_dsa|id_ecdsa|id_ed25519)$'
  'an SSH private key must never enter the tree'

  '(^|/)secrets?(/|$)'
  'paths under a secrets directory are credential material'

  '[Cc]redentials'
  'a credentials file is not editable by an agent'

  '(^|/)service-account.*\.json$'
  'a service-account key grants cloud access'

  '(^|/)\.aws/'
  'AWS credential and config files are owner-gated'
)

for ((i = 0; i < ${#PATTERNS[@]}; i += 2)); do
  if printf '%s' "$PATH_ARG" | grep -qE -e "${PATTERNS[i]}"; then
    deny "Blocked by .claude/hooks/pre-edit-sensitive.sh: ${PATTERNS[i+1]}.

Path: $PATH_ARG

Credentials are owner-gated (rule 30). Ask for the value to be set or rotated by
the owner rather than writing it into the tree. Anything committed here is
committed forever, and gitleaks scans a git checkout-index export, so adding a
.gitignore entry after the fact will not save you."
  fi
done

allow
