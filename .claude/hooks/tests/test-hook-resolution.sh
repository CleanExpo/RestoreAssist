#!/usr/bin/env bash
# test-hook-resolution.sh — the settings.json hook COMMANDS must find the repo's
# own hook even when CLAUDE_PROJECT_DIR is wrong.
#
# Run:  bash .claude/hooks/tests/test-hook-resolution.sh
#
# Why this exists (RA-8127 class, seen 23/11/2026 on the Mac mini): a session can
# start with CLAUDE_PROJECT_DIR=$HOME. The old command
#   "$CLAUDE_PROJECT_DIR"/.claude/hooks/pre-bash-destructive.sh
# then pointed at a file that is not there, `sh` exited 127, Claude Code treats
# 127 as a non-blocking error, and the safety check never ran while every call
# went through. test-guards.sh feeds payloads to the scripts directly and, for
# the wiring, only ever sets CLAUDE_PROJECT_DIR correctly, so it could not see this.
#
# This test runs each command string from settings.json, through `sh -c`, exactly
# as Claude Code does, and asserts on what the REAL hook decided.
#
# Dangerous payloads live in tests/fixtures/*.json, never in a command line, so
# this file can be run on a machine whose own guard reads command lines.

set -uo pipefail

HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$HOOKS_DIR/../.." && pwd)"
SETTINGS="$REPO/.claude/settings.json"
FIX="$HOOKS_DIR/tests/fixtures"

command -v jq >/dev/null || { echo "FAILED: jq is required"; exit 1; }

scratch="$(mktemp -d)"
trap 'rm -r "$scratch" 2>/dev/null || true' EXIT
wrong_dir="$scratch/wrong-project-dir"   # exists, holds no hooks
mkdir -p "$wrong_dir"

pass=0; fail=0

# run_cmd <command-string> <cwd> <project-dir | UNSET> <payload-file> [extra env assignment]
# Sets RC, OUT, ERR. The payload goes in on stdin, as Claude Code delivers it.
run_cmd() {
  local cmd="$1" cwd="$2" cpd="$3" payload="$4" extra="${5:-NOEXTRA=1}"
  if [[ "$cpd" == UNSET ]]; then
    OUT="$(cd "$cwd" && env -u CLAUDE_PROJECT_DIR "$extra" sh -c "$cmd" <"$payload" 2>"$scratch/err")"; RC=$?
  else
    OUT="$(cd "$cwd" && env CLAUDE_PROJECT_DIR="$cpd" "$extra" sh -c "$cmd" <"$payload" 2>"$scratch/err")"; RC=$?
  fi
  ERR="$(cat "$scratch/err")"
}

# verdict -> "deny", "allow", or "launch-failed(<rc>)". A hook that did not run
# is never reported as allow.
verdict() {
  if (( RC != 0 )); then printf 'launch-failed(%s)' "$RC"; return; fi
  if [[ -z "$OUT" ]]; then printf 'allow'; return; fi
  printf '%s' "$OUT" | jq -r '.hookSpecificOutput.permissionDecision // "allow"' 2>/dev/null || printf 'allow'
}

record() {  # <label> <expected> <got>
  if [[ "$3" == "$2" ]]; then pass=$((pass+1)); printf '  ok    %-66s %s\n' "$1" "$3"
  else fail=$((fail+1)); printf '  FAIL  %-66s expected %s, got %s\n' "$1" "$2" "$3"; fi
}

# The command strings under test: every PreToolUse hook command, paired with the
# fixture that the real hook must deny.
payload_for() {
  case "$1" in
    *pre-bash-destructive*) echo "$FIX/deny-bash-recursive-delete.json" ;;
    *pre-edit-sensitive*)   echo "$FIX/deny-edit-env.json" ;;
    *)                      echo "" ;;
  esac
}
name_of() {
  case "$1" in
    *pre-bash-destructive*) echo pre-bash-destructive ;;
    *pre-edit-sensitive*)   echo pre-edit-sensitive ;;
  esac
}

COMMANDS=()   # read in a loop: macOS ships bash 3.2, which has no mapfile
while IFS= read -r line; do COMMANDS+=("$line"); done < <(jq -r '.hooks.PreToolUse[].hooks[].command' "$SETTINGS")
(( ${#COMMANDS[@]} >= 2 )) || { echo "FAILED: expected at least two PreToolUse hook commands in settings.json, found ${#COMMANDS[@]}"; exit 1; }

echo "== every project-dir hook command is covered by this test =="
# A new hook wired through CLAUDE_PROJECT_DIR must be added to payload_for above,
# or it would ship with no resolution test.
uncovered=0
while IFS= read -r c; do
  if [[ -z "$(payload_for "$c")" ]]; then uncovered=$((uncovered+1)); printf '  FAIL  no resolution test for: %s\n' "$c"; fi
done < <(jq -r '.. | objects | select(has("command")) | .command | strings | select(contains("CLAUDE_PROJECT_DIR"))' "$SETTINGS")
if (( uncovered == 0 )); then pass=$((pass+1)); printf '  ok    %-66s %s\n' "all CLAUDE_PROJECT_DIR hook commands have a case" "covered"; else fail=$((fail+uncovered)); fi

echo
echo "== the real hook runs when CLAUDE_PROJECT_DIR is wrong =="
for cmd in "${COMMANDS[@]}"; do
  payload="$(payload_for "$cmd")"; name="$(name_of "$cmd")"
  [[ -n "$payload" ]] || continue

  run_cmd "$cmd" "$REPO" "$wrong_dir" "$payload";            record "$name: CLAUDE_PROJECT_DIR = empty dir with no hooks"  deny "$(verdict)"
  run_cmd "$cmd" "$REPO" "$HOME" "$payload";                 record "$name: CLAUDE_PROJECT_DIR = \$HOME"                   deny "$(verdict)"
  run_cmd "$cmd" "$REPO" "$scratch/does-not-exist" "$payload"; record "$name: CLAUDE_PROJECT_DIR = a path that is not there"  deny "$(verdict)"
  run_cmd "$cmd" "$REPO" UNSET "$payload";                   record "$name: CLAUDE_PROJECT_DIR unset"                      deny "$(verdict)"
  run_cmd "$cmd" "$REPO/.claude/hooks" "$HOME" "$payload";   record "$name: from a subdirectory of the repo"                deny "$(verdict)"
  run_cmd "$cmd" "$REPO" "$REPO" "$payload";                 record "$name: CLAUDE_PROJECT_DIR correct (unchanged behaviour)" deny "$(verdict)"
done

# The hook must also let ordinary work through: a resolution fix that denies
# everything, or fails everything, would read as green on the deny cases alone.
for cmd in "${COMMANDS[@]}"; do
  [[ "$cmd" == *pre-bash-destructive* ]] || continue
  run_cmd "$cmd" "$REPO" "$wrong_dir" "$FIX/allow-bash-git-status.json"
  record "pre-bash-destructive: a safe command still allowed, wrong dir" allow "$(verdict)"
done

echo
echo "== the hook launched is the REPO's own, not a hook found elsewhere =="
# A throwaway repo carrying an inert hook. Run from inside it with a wrong
# CLAUDE_PROJECT_DIR: the command must resolve to THIS repo's hook, so the planted
# dangerous payload is allowed. This also shows the deny assertions above can
# read "allow" when the hook is inert, so they are testing the hook.
fake="$scratch/fake-repo"
mkdir -p "$fake/.claude/hooks"
git -C "$fake" init -q 2>/dev/null
for n in pre-bash-destructive pre-edit-sensitive; do
  printf '#!/bin/sh\nexit 0\n' > "$fake/.claude/hooks/$n.sh"; chmod +x "$fake/.claude/hooks/$n.sh"
done
for cmd in "${COMMANDS[@]}"; do
  payload="$(payload_for "$cmd")"; name="$(name_of "$cmd")"
  [[ -n "$payload" ]] || continue
  run_cmd "$cmd" "$fake" "$wrong_dir" "$payload"
  record "$name: inert hook in the cwd repo is the one that runs" allow "$(verdict)"
done

echo
echo "== no hook anywhere: fail loudly, never look like a pass =="
# No hook at CLAUDE_PROJECT_DIR and not inside a repo. Exit 2 is the code Claude
# Code treats as a block; exit 127 or 1 is a non-blocking error and the tool call
# would go ahead as if the check had passed.
nogit="$scratch/not-a-repo"; mkdir -p "$nogit"
for cmd in "${COMMANDS[@]}"; do
  payload="$(payload_for "$cmd")"; name="$(name_of "$cmd")"
  [[ -n "$payload" ]] || continue
  run_cmd "$cmd" "$nogit" "$wrong_dir" "$payload" "GIT_CEILING_DIRECTORIES=$scratch"
  record "$name: exit code when the hook cannot be found" "launch-failed(2)" "$(verdict)"
  if [[ "$ERR" == *"$name.sh"* && -z "$OUT" ]]; then pass=$((pass+1)); printf '  ok    %-66s %s\n' "$name: names the missing hook on stderr, nothing on stdout" "loud"
  else fail=$((fail+1)); printf '  FAIL  %-66s stderr=[%s] stdout=[%s]\n' "$name: names the missing hook on stderr, nothing on stdout" "$ERR" "$OUT"; fi
done

echo
echo "passed: $pass   failed: $fail"
if (( fail > 0 )); then echo "RESULT: FAILED"; exit 1; fi
echo "RESULT: green — $pass assertions"
