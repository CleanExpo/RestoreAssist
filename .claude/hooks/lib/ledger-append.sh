#!/usr/bin/env bash
# ledger-append.sh — record one verification in the durable metrics ledger.
#
# Sourced by stop-verifier.sh. Called once per report the hook writes.
#
# WHY THIS EXISTS. The reports themselves land in .claude/verifier-reports/,
# which is in .gitignore. The 151 tracked files there are only tracked because
# they predate that rule; no new report will ever be committed, so the signal is
# discarded on every fresh clone. scripts/observability/ needs a series that
# GROWS, and sweeping a gitignored directory afterwards only works on a machine
# that still happens to have it. Capturing at the point of production is the fix
# docs/observability/README.md named as the next step.
#
# ONE FILE PER ENTRY. Each verification is written as its own one-line file in
# scripts/observability/verifier-ledger.d/, named
#   <timestamp>-<readable domain>-<key hash>.jsonl
# by THE NAMING RULE set out at the top of scripts/observability/ledger.ts. The
# readable domain is for a person; the key hash, taken over the untouched
# session and domain, is what tells two events apart. Two domains that sanitise
# to the same text ("a/b" and "a?b") used to share one name, and the second
# write replaced the first.
# The ledger used to be a single verifier-ledger.jsonl that every branch
# appended to, so whichever PR merged first left every other open PR conflicting
# on it, and resolving that pushed a new head and voided its release receipt.
# Two branches now add two different files and git merges them without asking.
# verifier-ledger.jsonl is kept as frozen history and is never appended again.
#
# THE LINE SHAPE AND THE FILE NAME MUST MATCH scripts/observability/ledger.ts
# EXACTLY. collect-verifier-metrics.ts writes through ledger.ts into the same
# directory, and readLedger() reads both without knowing which wrote which, so
# an extra key or a null where the TypeScript omits the field would make the two
# producers disagree about the same event. JSON.stringify drops undefined, so
# the terse report shape carries four keys and the full one seven. Matching
# names mean the same event recorded twice overwrites one file instead of
# adding a second. Both writers are held to the names listed in
# scripts/observability/__tests__/ledger-name-vectors.json, which neither of
# them computed.
#
# THE REPORT RULE, set out at the top of ledger.ts, says what a report becomes.
# A verification that happened is always recorded. A report that is valid JSON
# but not an object, or whose status is not text, is recorded as "unknown". A
# claim count is written only when it is a whole number from 0 to
# 9007199254740991; anything else (null, text, a fraction, 1e400) is left out
# and the record is written without it. Both writers are held to
# scripts/observability/__tests__/ledger-report-vectors.json.
#
# THIS NEVER FAILS THE HOOK. Every path swallows its errors and returns 0. A
# metrics write that could block a Stop would be a worse defect than the missing
# metric it was added to fix.
#
# Overrides:
#   VERIFIER_LEDGER_SKIP=1        record nothing
#   VERIFIER_LEDGER_DIR=<dir>     write entries into <dir> instead
#   VERIFIER_LEDGER_PATH=<f>.jsonl  legacy single-file override; mapped to the
#                                 sibling directory <f>.d/ so that file itself
#                                 is never appended to again

# _ledger_sha256 <string> -> the 64 hex chars of its sha256, or nothing when no
# hashing tool is present or its output is not a digest.
_ledger_sha256() {
  local h=""
  if command -v sha256sum >/dev/null 2>&1; then
    h=$(printf '%s' "$1" | sha256sum 2>/dev/null)
  elif command -v shasum >/dev/null 2>&1; then
    h=$(printf '%s' "$1" | shasum -a 256 2>/dev/null)
  elif command -v openssl >/dev/null 2>&1; then
    h=$(printf '%s' "$1" | openssl dgst -sha256 -r 2>/dev/null)
  fi
  h="${h%% *}"
  if [[ "$h" =~ ^[0-9a-f]{64}$ ]]; then printf '%s' "$h"; fi
  return 0
}

# _ledger_entry_name <session> <timestamp> <domain> -> the entry file name, or
# nothing. This is THE NAMING RULE of scripts/observability/ledger.ts
# (entryFileName), byte for byte; change one and the other must change with it.
_ledger_entry_name() {
  local session="$1" ts="$2" domain="$3"
  local session_hash domain_hash key_hash readable
  session_hash="$(_ledger_sha256 "$session")"
  domain_hash="$(_ledger_sha256 "$domain")"
  [[ -n "$session_hash" && -n "$domain_hash" ]] || return 0
  key_hash="$(_ledger_sha256 "${session_hash}:${ts}:${domain_hash}")"
  [[ -n "$key_hash" ]] || return 0
  # Same rule as ledger.ts safeSegment(): every byte outside [A-Za-z0-9._-]
  # becomes "_", a line break included, so the readable part can never carry a
  # path separator. tr, not sed: sed works a line at a time and would leave a
  # line break in the name.
  readable="$(printf '%s' "$domain" | LC_ALL=C tr -c 'A-Za-z0-9._-' '_' 2>/dev/null)"
  readable="${readable:0:64}"
  [[ -n "$readable" ]] || readable="_"
  printf '%s-%s-%s.jsonl' "$ts" "$readable" "${key_hash:0:32}"
  return 0
}

# ledger_append <report-json-file> <session-id> <timestamp> <domain>
ledger_append() {
  local report="$1" session="$2" ts="$3" domain="$4"

  [[ "${VERIFIER_LEDGER_SKIP:-}" == "1" ]] && return 0
  [[ -r "$report" ]] || return 0

  # REPO_DIR is .claude/; the ledger lives beside the code that reads it.
  local dir
  if [[ -n "${VERIFIER_LEDGER_DIR:-}" ]]; then
    dir="$VERIFIER_LEDGER_DIR"
  elif [[ -n "${VERIFIER_LEDGER_PATH:-}" ]]; then
    dir="${VERIFIER_LEDGER_PATH%.jsonl}.d"
  else
    local root
    root="$(cd "$REPO_DIR/.." 2>/dev/null && pwd)" || return 0
    [[ -n "$root" ]] || return 0
    dir="$root/scripts/observability/verifier-ledger.d"
  fi
  # Only the leaf is ever created. A parent that does not exist means the path
  # is wrong, and inventing a directory tree for it would hide that.
  [[ -d "$(dirname "$dir")" ]] || return 0
  [[ -d "$dir" ]] || mkdir "$dir" 2>/dev/null || return 0

  # The timestamp goes into a file name and into the key hash, so it must be a
  # plain integer that this writer and ledger.ts print the same way: no leading
  # zero, and at most 15 digits so neither jq nor JavaScript rounds it.
  [[ "$ts" =~ ^(0|[1-9][0-9]{0,14})$ ]] || return 0

  # THE REPORT RULE of scripts/observability/ledger.ts (reportFields), in jq. A
  # report that is not an object has no status and no counts. A status that is
  # not text is "unknown". A count is kept only when it is a whole number from 0
  # to 9007199254740991, and is written in its plainest form (4.0 and 1e2 become
  # 4 and 100, as JSON.stringify writes them). Nothing a report holds can make
  # this program fail, so a verification that happened always leaves a record.
  local line
  line=$(jq -c -n \
    --arg s "$session" \
    --argjson t "$ts" \
    --arg d "$domain" \
    --slurpfile r "$report" '
      def count:
        if type != "number" then null
        elif . < 0 or . > 9007199254740991 then null
        elif . != floor then null
        elif . == 0 then 0
        else floor end;
      def counted($key; $value):
        ($value | count) as $c | if $c == null then {} else {($key): $c} end;
      ($r[0]) as $report
      | (if ($report | type) == "object" then $report else {} end) as $body
      | {sessionId: $s, timestamp: $t, domain: $d,
         status: (if ($body.status | type) == "string" then $body.status else "unknown" end)}
      + counted("claimsTotal";  $body.claims_total)
      + counted("claimsFailed"; $body.claims_failed)
      + counted("claimsWarned"; $body.claims_warned)
    ' 2>/dev/null) || return 0

  [[ -n "$line" ]] || return 0

  local name
  name="$(_ledger_entry_name "$session" "$ts" "$domain")"
  [[ -n "$name" ]] || return 0

  # Write to a dot-prefixed temporary name and rename, so a reader never sees a
  # half-written entry. Readers ignore dotfiles and anything not ending .jsonl.
  local tmpf="$dir/.${name}.$$.tmp"
  if printf '%s\n' "$line" > "$tmpf" 2>/dev/null; then
    mv -f "$tmpf" "$dir/$name" 2>/dev/null || rm -f "$tmpf" 2>/dev/null
  else
    rm -f "$tmpf" 2>/dev/null
  fi
  return 0
}
