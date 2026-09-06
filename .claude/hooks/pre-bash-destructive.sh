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
  # Wrapper words hide the interpreter. `env bash <<EOF` and `command bash <<EOF`
  # both slipped past a test that only allowed `sudo` in front of the shell, so
  # their heredoc bodies were treated as data and never scanned.
  local wrap='((sudo|env|command|exec|nohup|time|xargs|nice|stdbuf)[[:space:]]+)*'
  if printf '%s' "$cmd" | grep -qE "(^|[;&|(][[:space:]]*)${wrap}(ba|z|k|da)?sh([[:space:]]|$)|\\|[[:space:]]*${wrap}(ba|z|k|da)?sh([[:space:]]|$)|(^|[[:space:]])(eval|source)([[:space:]]|$)"; then
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

# `rm` needs two facts checked together: that rm is a command word (not a
# substring of charm-rf.ts), and that ITS OWN flags carry both recursive and
# force, in whatever order or spelling.
#
# "Its own" is the part that took two attempts. The first version tested the
# whole command for a recursive-ish flag and a force-ish flag independently, and
# `-[[:alnum:]]*r` matches any flag containing an r — so `jq --argjson` supplied
# the "recursive" half and an unrelated `rm -f` elsewhere supplied the rest. It
# denied a python heredoc that only mentioned those strings as data. A guard
# with false positives gets switched off, which is worse than not having it.
#
# So the flags are read from the rm invocation itself: everything from the rm
# command word up to the first argument that is not a flag.
#
# Known gap: `xargs rm -rf` and other indirection are not caught — the deny list
# and the owner gates are the layers behind this one.
# A quote opens a command context as surely as a semicolon does: the body of
# `bash -c 'rm -rf x'` is code, and treating the quote as ordinary text let that
# form through entirely. Same for `sh -c "..."`. The cost is that a command
# merely QUOTING the pattern, such as echo "rm -rf", is now denied too; that is
# the right way round for a guard whose failure mode is deleting a tree.
SQ=$'\047'
CMD_WORD_RM="(^|[;&|(${SQ}\"\`])[[:space:]]*(sudo[[:space:]]+)?rm[[:space:]]"
rm_flags="$(printf '%s' "$SCAN" \
  | grep -oE "(^|[;&|(${SQ}\"\`])[[:space:]]*(sudo[[:space:]]+)?rm([[:space:]]+-{1,2}[A-Za-z-]+)*" \
  | head -1)"
if matches "$CMD_WORD_RM" \
   && printf '%s' "$rm_flags" | grep -qE -- '(-[A-Za-z]*r|--recursive)' \
   && printf '%s' "$rm_flags" | grep -qE -- '(-[A-Za-z]*f|--force)'; then
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
