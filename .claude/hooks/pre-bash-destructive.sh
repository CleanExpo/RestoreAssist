#!/usr/bin/env bash
# pre-bash-destructive.sh — PreToolUse(Bash): refuse irreversible shell commands.
#
# Replaces the inline guard that lived in .claude/settings.local.json, which read
# $CLAUDE_TOOL_INPUT (a variable Claude Code does not set) and exited 1 (a code
# that does not block). It therefore allowed every command it claimed to stop.
#
# Why this exists when permissions.deny already lists the same patterns:
# deny patterns are prefix-anchored, so `Bash(rm -rf *)` catches `rm -rf x` but
# not `cd /tmp && rm -rf x`. This guard matches anywhere in the command, which is
# the gap the deny list cannot close.
#
# Patterns live in a paired array, not a delimited heredoc. A `|`-delimited table
# silently truncates every regex containing alternation, which is most of them —
# the first draft of this file lost seven of nine patterns that way and the tests
# caught it. Every grep uses `-e` so a pattern starting with `-` is read as a
# pattern and not as an option.
#
# Stdin:  PreToolUse payload JSON
# Stdout: a permissionDecision, or nothing
# Exit:   always 0 — the decision is carried in the JSON, not the exit code

set -uo pipefail
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deny.sh
source "$HOOK_DIR/lib/deny.sh"

PAYLOAD="$(hook_payload)"
CMD="$(field "$PAYLOAD" '.tool_input.command')"
[[ -z "$CMD" ]] && allow

# A heredoc body is data on a command's stdin, not shell code — a commit message,
# a SQL fixture, a file being written. Scanning it produces false positives that
# are worse than useless: this guard's own commit message, which described the
# patterns it matches, was blocked by it.
#
# Stripping is refused when the body could actually be executed: when the command
# leads with a shell interpreter, or pipes anywhere into one. `bash <<EOF` and
# `cat <<EOF | sh` are code, and are scanned in full.
strip_heredocs() {
  local cmd="$1"
  if printf '%s' "$cmd" | grep -qE '(^|[;&|(][[:space:]]*)(sudo[[:space:]]+)?(ba|z|k|da)?sh([[:space:]]|$)|\|[[:space:]]*(sudo[[:space:]]+)?(ba|z|k|da)?sh([[:space:]]|$)|(^|[[:space:]])(eval|source)([[:space:]]|$)'; then
    printf '%s' "$cmd"
    return
  fi
  printf '%s' "$cmd" | awk '
    !inbody && match($0, /<<-?[[:space:]]*[\x27"]?([A-Za-z_][A-Za-z0-9_]*)[\x27"]?/) {
      tag = substr($0, RSTART, RLENGTH)
      gsub(/^<<-?[[:space:]]*[\x27"]?|[\x27"]?$/, "", tag)
      inbody = 1; endtag = tag; print; next
    }
    inbody { if ($0 ~ "^[[:space:]]*" endtag "[[:space:]]*$") inbody = 0; next }
    { print }
  '
}

SCAN="$(strip_heredocs "$CMD")"

matches() { printf '%s' "$SCAN" | grep -qiE -e "$1"; }

# Read-only search tools are exempt. Grepping for the word TRUNCATE cannot
# truncate anything, and without this the guard blocks the very audits that find
# the risky code.
#
# The exemption applies ONLY to a single simple command. Reading the leading word
# alone is not enough: `grep -r x . && rm -rf /tmp/y` also leads with grep, and
# an exemption that stopped there would hand every caller a one-word bypass. So
# any shell operator — a chain, a pipe, a substitution — disqualifies it, and a
# piped search is then judged on its full text like anything else.
if ! printf '%s' "$CMD" | grep -qE '[;&|`]|\$\(|<\(|>\('; then
  leading_word="$(printf '%s' "$CMD" \
    | sed -E 's/^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*//' \
    | awk '{print $1}')"
  case "${leading_word##*/}" in
    grep|egrep|fgrep|rg|ripgrep|ack|ag) allow ;;
  esac
fi

# `rm` needs three facts checked together rather than one regex: that rm is a
# command word (not a substring of charm-rf.ts), and that the flags carry both
# recursive and force in whatever order or spelling. Known gap: `xargs rm -rf`
# and other indirection are not caught — the deny list and the owner gates are
# the layers behind this one.
CMD_WORD_RM='(^|[;&|(])[[:space:]]*(sudo[[:space:]]+)?rm[[:space:]]'
if matches "$CMD_WORD_RM" \
   && matches '(-[[:alnum:]]*r|--recursive)' \
   && matches '(-[[:alnum:]]*f|--force)'; then
  deny "Blocked by .claude/hooks/pre-bash-destructive.sh: recursive force-delete removes files with no undo.

Command: $CMD

If this is genuinely required, say what you are trying to do and why the
non-destructive route does not work, and let the owner run it. Do not rewrite
the command to slip past the pattern."
fi

# Pairs of <extended regex> <what it would cost you>. Matched case-insensitively,
# anywhere in the command.
PATTERNS=(
  'git[[:space:]]+push[[:space:]]+.*--force'
  'force-push discards commits that other clones still reference'

  '--no-verify'
  '--no-verify skips the pre-commit and pre-push gates this repo relies on'

  'git[[:space:]]+reset[[:space:]]+--hard'
  'reset --hard destroys uncommitted work, and leaves no reflog entry for it'

  'DROP[[:space:]]+(TABLE|DATABASE|SCHEMA)'
  'dropping a table, database or schema is a production data-loss action (rule 29)'

  'TRUNCATE[[:space:]]+(TABLE[[:space:]]+)?[[:alnum:]_".]'
  'truncating a table is a production data-loss action (rule 29)'
)

for ((i = 0; i < ${#PATTERNS[@]}; i += 2)); do
  if matches "${PATTERNS[i]}"; then
    deny "Blocked by .claude/hooks/pre-bash-destructive.sh: ${PATTERNS[i+1]}.

Command: $CMD

If this is genuinely required, say what you are trying to do and why the
non-destructive route does not work, and let the owner run it. Do not rewrite
the command to slip past the pattern."
  fi
done

allow
