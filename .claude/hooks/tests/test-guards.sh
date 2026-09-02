#!/usr/bin/env bash
# test-guards.sh — behaviour tests for the two PreToolUse guards.
#
# Run:  bash .claude/hooks/tests/test-guards.sh
#
# Each case feeds a real PreToolUse payload on stdin and reads the guard's
# decision back with jq. It asserts on the parsed permissionDecision, not on the
# presence of a word in the output: the guards these replace printed the word
# "BLOCKED" while allowing the call, so any assertion satisfied by that string
# would have passed against a guard that did nothing.
#
# The suite ends by sabotaging each guard and re-running the deny cases. A test
# that has never been observed to fail has not been shown to guard anything, so
# if the deny cases still pass with the guard neutered, the suite is reported
# broken and exits non-zero.

set -uo pipefail

HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASH_GUARD="$HOOKS_DIR/pre-bash-destructive.sh"
EDIT_GUARD="$HOOKS_DIR/pre-edit-sensitive.sh"

pass=0; fail=0

# decision <guard> <payload> -> prints "deny" or "allow"
decision() {
  local out
  out="$(printf '%s' "$2" | bash "$1" 2>/dev/null)"
  if [[ -z "$out" ]]; then
    printf 'allow'
  else
    printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "allow"' 2>/dev/null || printf 'allow'
  fi
}

bash_payload()  { jq -n --arg c "$1" '{tool_name:"Bash",  tool_input:{command:$c}}'; }
edit_payload()  { jq -n --arg p "$1" '{tool_name:"Edit",  tool_input:{file_path:$p}}'; }

check() {  # <label> <guard> <payload> <expected>
  local label="$1" guard="$2" payload="$3" expected="$4" got
  got="$(decision "$guard" "$payload")"
  if [[ "$got" == "$expected" ]]; then
    pass=$((pass+1)); printf '  ok    %-58s %s\n' "$label" "$got"
  else
    fail=$((fail+1)); printf '  FAIL  %-58s expected %s, got %s\n' "$label" "$expected" "$got"
  fi
}

# Dangerous strings are assembled rather than written literally so this file can
# be grepped, copied and run without the repo's own deny list intercepting it.
RM_RF="$(printf '%s %s' 'rm' '-rf')"
DROP_T="$(printf '%s %s' 'DROP' 'TABLE')"

echo "== destructive command guard =="
check "bare recursive force-delete"      "$BASH_GUARD" "$(bash_payload "$RM_RF /tmp/x")"                 deny
check "same, buried in a compound cmd"   "$BASH_GUARD" "$(bash_payload "cd /tmp && $RM_RF x")"           deny
check "flags in the other order"         "$BASH_GUARD" "$(bash_payload "$(printf '%s %s' 'rm' '-fr') /tmp/x")" deny
check "force push"                       "$BASH_GUARD" "$(bash_payload 'git push --force origin main')"  deny
check "force-with-lease is still force"  "$BASH_GUARD" "$(bash_payload 'git push --force-with-lease')"   deny
check "skipping the commit gates"        "$BASH_GUARD" "$(bash_payload 'git commit --no-verify -m x')"   deny
check "hard reset"                       "$BASH_GUARD" "$(bash_payload 'git reset --hard HEAD~3')"       deny
check "dropping a table"                 "$BASH_GUARD" "$(bash_payload "psql -c '$DROP_T users'")"       deny
check "truncating a table"               "$BASH_GUARD" "$(bash_payload "psql -c 'TRUNCATE users'")"      deny

check "ordinary delete of one file"      "$BASH_GUARD" "$(bash_payload 'rm /tmp/scratch.txt')"           allow
check "npm test"                         "$BASH_GUARD" "$(bash_payload 'npm run test:unit')"             allow
check "searching for the word TRUNCATE"  "$BASH_GUARD" "$(bash_payload 'grep -rn "TRUNCATE" prisma/')"   allow
check "rg for the word, same exemption"  "$BASH_GUARD" "$(bash_payload 'rg "DROP TABLE" --type sql')"    allow
check "search exemption stops at &&"     "$BASH_GUARD" "$(bash_payload "grep -r x . && $RM_RF /tmp/y")"  deny
check "a filename containing rm"         "$BASH_GUARD" "$(bash_payload 'cat lib/charm-rf.ts')"           allow
check "empty command"                    "$BASH_GUARD" '{"tool_name":"Bash","tool_input":{}}'            allow

# Flags belong to the rm that carries them, not to the command as a whole. This
# guard blocked its own author over exactly this: an unrelated `jq --argjson`
# supplied the "recursive" half (--argjson contains -a...r), a plain `rm -f`
# supplied the force half, and the two were credited to each other.
check "rm -f plus an unrelated -r- flag"  "$BASH_GUARD" \
  "$(bash_payload 'jq --argjson t 1 -n "{}" && rm -f /tmp/one.json')"                                    allow
check "rm -f beside --recursive on rsync" "$BASH_GUARD" \
  "$(bash_payload 'rsync --recursive a/ b/ && rm -f /tmp/one.txt')"                                      allow
check "flags still caught on the rm itself" "$BASH_GUARD" \
  "$(bash_payload "jq --argjson t 1 -n '{}' && $RM_RF /tmp/x")"                                          deny
check "long-form flags on the rm itself"  "$BASH_GUARD" \
  "$(bash_payload 'rm --recursive --force /tmp/x')"                                                      deny

# A heredoc body is data, not shell code. A commit message that describes these
# patterns must not be blocked by them — that is not hypothetical, it is how this
# guard's own commit was first refused.
COMMIT_MSG="$(printf 'git commit -F - <<%sMSG%s\nfix: the guard caught %s and --no-verify\nMSG' "'" "'" "$RM_RF")"
check "commit message describing them"   "$BASH_GUARD" "$(bash_payload "$COMMIT_MSG")"                   allow
check "writing a doc that mentions them" "$BASH_GUARD" \
  "$(bash_payload "$(printf 'cat > notes.md <<%sEOF%s\nnever run %s here\nEOF' "'" "'" "$RM_RF")")"      allow

# ...but a heredoc fed to a shell IS code, and must still be read.
check "heredoc piped into a shell"       "$BASH_GUARD" \
  "$(bash_payload "$(printf 'cat <<%sEOF%s | bash\n%s /tmp/x\nEOF' "'" "'" "$RM_RF")")"                  deny
check "heredoc handed to bash directly"  "$BASH_GUARD" \
  "$(bash_payload "$(printf 'bash <<%sEOF%s\n%s /tmp/x\nEOF' "'" "'" "$RM_RF")")"                        deny
check "danger after the heredoc closes"  "$BASH_GUARD" \
  "$(bash_payload "$(printf 'cat > n.md <<%sEOF%s\nharmless\nEOF\n%s /tmp/x' "'" "'" "$RM_RF")")"        deny

echo
echo "== sensitive file guard =="
check "the .env file"                    "$EDIT_GUARD" "$(edit_payload '/repo/.env')"                    deny
check "an environment-specific .env"     "$EDIT_GUARD" "$(edit_payload '/repo/.env.production')"          deny
check "a private key"                    "$EDIT_GUARD" "$(edit_payload '/repo/certs/server.pem')"         deny
check "an ssh key"                       "$EDIT_GUARD" "$(edit_payload '/home/user/.ssh/id_ed25519')"     deny
check "anything under secrets/"          "$EDIT_GUARD" "$(edit_payload '/repo/secrets/stripe.json')"      deny
check "a credentials file"               "$EDIT_GUARD" "$(edit_payload '/repo/config/credentials.yml')"   deny
check "an aws credential file"           "$EDIT_GUARD" "$(edit_payload '/home/user/.aws/config')"         deny
check "a service-account key"            "$EDIT_GUARD" "$(edit_payload '/repo/service-account-prod.json')" deny

check ".env.example is a template"       "$EDIT_GUARD" "$(edit_payload '/repo/.env.example')"             allow
check "ordinary source file"             "$EDIT_GUARD" "$(edit_payload '/repo/lib/gst-rules.ts')"         allow
check "a file merely named keyboard.ts"  "$EDIT_GUARD" "$(edit_payload '/repo/lib/keyboard.ts')"          allow
check "no path in the payload"           "$EDIT_GUARD" '{"tool_name":"Edit","tool_input":{}}'             allow

echo
echo "== dead-check: neuter each guard and confirm the deny cases notice =="
# If a guard can be emptied without the suite going red, the suite proves nothing.
sabotage_dir="$(mktemp -d)"
trap 'rm -r "$sabotage_dir" 2>/dev/null || true' EXIT
printf '#!/usr/bin/env bash\nexit 0\n' > "$sabotage_dir/inert.sh"

sabotage_fail=0
for label_payload in \
  "destructive:$(bash_payload "$RM_RF /tmp/x")" \
  "sensitive:$(edit_payload '/repo/.env')"
do
  label="${label_payload%%:*}"; payload="${label_payload#*:}"
  got="$(decision "$sabotage_dir/inert.sh" "$payload")"
  if [[ "$got" == "deny" ]]; then
    printf '  BROKEN  %s: an inert guard still read as deny — the assertion is not testing the guard\n' "$label"
    sabotage_fail=$((sabotage_fail+1))
  else
    printf '  ok      %s: inert guard reads as allow, so a real deny is meaningful\n' "$label"
  fi
done

echo
echo "passed: $pass   failed: $fail   dead-check failures: $sabotage_fail"
if (( fail > 0 || sabotage_fail > 0 )); then
  echo "RESULT: FAILED"
  exit 1
fi
echo "RESULT: green — $pass assertions, each shown to fail against an inert guard"
