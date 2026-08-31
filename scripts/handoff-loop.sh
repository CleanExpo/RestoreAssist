#!/usr/bin/env bash
# handoff-loop.sh — RestoreAssist definition-of-done gate for /session-handoff.
#
# session-handoff's Phase 0 runs this FIRST, every time. Exit 0 => the tree is
# green and the skill writes a normal handoff. Non-zero => the skill writes a
# BLOCKED handoff naming the failing gate. This script must therefore FAIL
# HONESTLY: a gate that cannot run (deps not installed, tool absent) is reported
# SKIPPED — never silently passed — matching CLAUDE.md's "No fake success" rule.
#
# Modes:
#   (default)  standard gates — generated-files, type-check, lint, no-emoji,
#              DB-independent build, fast security scan. No dep install, no DB,
#              no live-server (smoke) tests.
#   --quick    interim gates only — type-check + lint + no-emoji. Fastest; for
#              frequent mid-session handoffs.
#   --full     install deps first (npm ci), then the standard gates plus
#              the real production build and the DB-independent audit suite.
#
# Escape hatch: HANDOFF_GATE_SKIP=1 short-circuits to exit 0 (logged loudly),
# for the rare case a handoff must be written while gates are known-broken
# upstream (mirrors stop-verifier.sh's CLAUDE_VERIFIER_SKIP pattern).
#
# Stdout/stderr: human-readable progress, teed to .handoff-logs/handoff-<ts>.log
# Exit: 0 = every gate that ran passed (skips allowed); 1 = a gate FAILED;
#       2 = usage / setup error.

set -uo pipefail

MODE="standard"
case "${1:-}" in
  --quick) MODE="quick" ;;
  --full)  MODE="full" ;;
  "")      MODE="standard" ;;
  *) echo "handoff-loop.sh: unknown argument '$1' (use --quick | --full)" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || { echo "handoff-loop.sh: cannot cd to repo root '$ROOT'" >&2; exit 2; }

TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="$ROOT/.handoff-logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/handoff-$TS.log"

# Tee all output to the log the skill cites in its Phase 0 §5/§6.
exec > >(tee -a "$LOG") 2>&1

echo "== handoff-loop.sh ($MODE) @ $TS =="
echo "repo: $ROOT"
echo "log:  $LOG"
echo

if [[ "${HANDOFF_GATE_SKIP:-}" == "1" ]]; then
  echo "HANDOFF_GATE_SKIP=1 set — all gates bypassed, exiting 0 (handoff proceeds UNGATED)."
  exit 0
fi

PASSED=(); FAILED=(); SKIPPED=()

have_deps() { [[ -d "$ROOT/node_modules" ]]; }
need_deps()  { have_deps || { echo "node_modules absent — run with --full to install first"; return 77; }; }

# run_gate <label> <fn/command...> — captures pass / fail / skip (rc 77).
run_gate() {
  local label="$1"; shift
  echo "----- gate: $label -----"
  if "$@"; then
    echo "[PASS] $label"
    PASSED+=("$label")
  else
    local rc=$?
    if (( rc == 77 )); then
      echo "[SKIP] $label"
      SKIPPED+=("$label")
    else
      echo "[FAIL] $label (rc=$rc)"
      FAILED+=("$label")
    fi
  fi
  echo
}

# ---- Gate implementations ----

gate_clean() {
  # Informational only. A dirty tree is normal mid-session (handoffs exist to
  # capture WIP), so this NEVER fails — it just records the state in the log.
  git status --short || true
  local n; n=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  echo "working tree: ${n} uncommitted path(s) (informational, non-blocking)"
  return 0
}

gate_deps()      { command -v npm >/dev/null 2>&1 || { echo "npm not on PATH"; return 77; }; npm ci; }
gate_generated() { need_deps && npm run prisma:generate; }
gate_type()      { need_deps && npm run type-check; }
gate_lint()      { need_deps && npm run lint; }
gate_emoji()     { need_deps && npm run check:no-emoji; }
gate_build_nodb(){ need_deps && npm run validate:next-build-no-db; }
gate_build_full(){ need_deps && npm run build; }
gate_security()  { need_deps && npm run security:scan; }

# The content/convention guards that .github/workflows/pr-checks.yml enforces on
# every PR. They were absent here, so "RESULT: green" could — and on 2026-07-29
# did — precede a PR that CI reds. check:no-lucide is the one that bit: an icon
# swap passed every local gate and would have failed the Lucide guard remotely.
# Runs every guard rather than short-circuiting, so one run reports all failures.
gate_guards() {
  need_deps || return 77
  local rc=0
  npm run check:no-lucide          || rc=1
  npm run check:spec-docs          || rc=1
  npm run check:encoding           || rc=1
  npm run check:ssot               || rc=1
  npm run check:standards          || rc=1
  npm run check:no-verbatim        || rc=1
  npm run check:marketing-verbatim || rc=1
  npm run check:au-english         || rc=1
  return $rc
}

# handoff-loop ran no tests at all. A gate that reports a tree "ready to hand
# off" without executing the suite is asserting something it never checked.
#
# Measured on origin/main 2026-07-31: 4 of 5536 tests fail locally, every one with
# "DATABASE_URL is required to initialize PrismaClient". They pass in CI, which
# provisions an ephemeral Postgres and runs prisma migrate deploy first. So a
# hard-failing tests gate would be red on a clean checkout and get ignored, and a
# silently-passing one would be a lie. It SKIPS loudly instead — the summary
# prints "skipped: tests" so nobody reads a DB-less run as full coverage.
#
# LIMITATION, stated rather than papered over: a run with skips still exits 0,
# the same code as a fully covered run. The distinction lives in stdout
# ("RESULT: green (with skips: ...)"), not the exit status. A caller that
# inspects only the exit code CAN misread a DB-less run as fully covered.
# Changing the exit contract would break existing callers, so it is documented
# here instead — parse the RESULT line, not just $?.
# This gate NEVER runs the suite automatically, and DATABASE_URL is deliberately
# not the trigger. The DB-gated suites are `describe.skipIf(!process.env.DATABASE_URL)`,
# so setting that variable is precisely what switches them ON — and their setup is
# unscoped and destructive:
#   scripts/__tests__/grandfather-payments-addon.test.ts:6-10
#   scripts/__tests__/backfill-setup-wizard.test.ts:6-12
# both call prisma.user.deleteMany({}) / workspace / organization deleteMany({}).
# Triggering on "DATABASE_URL is set" would therefore wipe whatever database that
# URL names as a side effect of a handoff check. Same hazard class this script
# already refuses for `prisma migrate deploy`.
#
# The safe CI-representative path is `npm run test:db`, which stands up its own
# throwaway pgvector container and destroys it on exit. It is run deliberately by
# an operator, never implicitly by this gate.
gate_tests() {
  need_deps || return 77
  echo "Tests are NOT run by this gate, by design — see the comment above."
  echo "The DB-backed suites truncate users/workspaces/organizations, so keying"
  echo "them off DATABASE_URL would destroy data in whatever DB it points at."
  echo "This gate is NOT green, it did not run."
  echo "CI-representative run, isolated and disposable:  npm run test:db"
  return 77
}

gate_audits() {
  need_deps || return 77
  local rc=0
  npm run audit:ai   || rc=1
  npm run audit:api  || rc=1
  npm run audit:rls  || rc=1
  # audit:prod is ENFORCING in CI (pr-checks.yml, RA-6719): a new high/critical
  # production advisory fails the PR. Omitting it here meant --full could report
  # green while CI redded on a fresh CVE.
  npm run audit:prod || rc=1
  return $rc
}

# NO migration-drift gate inside this script, deliberately. CI's RA-1546 gate
# (pr-checks.yml) runs three `prisma migrate resolve --applied`, then
# `migrate deploy`, then `migrate status`.
#
# That sequence IS reproducible locally — `npm run test:db` (scripts/ci/test-with-db.sh)
# provisions the same digest-pinned pgvector 0.8.6-pg16 image CI uses, pre-resolves the same
# migrations, applies them, and tears the container down on exit. What is unsafe
# is running it from HERE against whatever DATABASE_URL happens to be set: that
# would apply migrations to a real database as a side effect of a handoff check.
#
# A status-only substitute was tried and removed. It reads the migration ledger
# but never executes migration SQL, so it cannot catch a migration that fails on
# apply — the exact class RA-1546 exists to catch — while appearing to cover it.
#
# So: drift stays a CI gate, and `npm run test:db` is the local parity path an
# operator can run deliberately.
#
# The RED measurement this comment used to carry is OUT OF DATE and was being
# quoted as current a month after it was taken. It read: "measured 2026-07-31 on
# origin/main, `npm run test:db` is currently RED - 125 test files / 178 tests
# fail with 'headers was called outside a request scope'".
#
# Re-measured 2026-08-31 against a Postgres 16 + pgvector cluster with migrations
# applied and DATABASE_URL, DIRECT_URL and RELEASE_DB_PROFILE=1 exported:
#
#   Test Files  960 passed (960)
#   Tests       7520 passed (7520)
#
# with check-test-parity.mjs --strict confirming all 20 env-gated suites ran
# rather than skipping. The suite is GREEN. The request-context failures are
# gone.
#
# Date any measurement written into a comment. An undated "currently RED" is
# indistinguishable from a fresh one and gets requoted as fact -- this one was,
# in a review of the /done command, as evidence that a green run covers no tests.
#
# gate_tests still does NOT invoke test:db automatically, and that is unchanged
# by the above. The reason was never that the suite was red; it is the
# destructive-truncation hazard documented at the gate itself. Promoting the gate
# is now a question about whether a database is reliably available to every
# caller, not about whether the suite passes.
#
# Do not add a migrate-deploy against an unknown DATABASE_URL in this script.
#
# STANDING HAZARD, pre-existing and NOT introduced here: --full runs
# gate_build_full -> npm run build -> scripts/build.sh:48, which itself runs
# `prisma migrate deploy` whenever DATABASE_URL is set and VERCEL_ENV is not
# preview/development. So running --full against a real DATABASE_URL already
# mutates that database. Run --full with DATABASE_URL unset, or against a
# throwaway database only.

# ---- Dispatch by mode ----

run_gate "clean" gate_clean

case "$MODE" in
  quick)
    run_gate "type-check" gate_type
    run_gate "lint"       gate_lint
    run_gate "no-emoji"   gate_emoji
    ;;
  standard)
    run_gate "generated-files" gate_generated
    run_gate "type-check"      gate_type
    run_gate "lint"            gate_lint
    run_gate "no-emoji"        gate_emoji
    run_gate "guards"          gate_guards
    run_gate "build (no-db)"   gate_build_nodb
    run_gate "security-scan"   gate_security
    run_gate "tests"           gate_tests
    ;;
  full)
    run_gate "deps"            gate_deps
    run_gate "generated-files" gate_generated
    run_gate "type-check"      gate_type
    run_gate "lint"            gate_lint
    run_gate "no-emoji"        gate_emoji
    run_gate "guards"          gate_guards
    run_gate "build"           gate_build_full
    run_gate "security-scan"   gate_security
    run_gate "tests"           gate_tests
    run_gate "audits"          gate_audits
    ;;
esac

# ---- Summary ----
echo "== summary =="
echo "passed:  ${PASSED[*]:-(none)}"
echo "skipped: ${SKIPPED[*]:-(none)}"
echo "failed:  ${FAILED[*]:-(none)}"
echo "log:     $LOG"
echo

if (( ${#FAILED[@]} > 0 )); then
  echo "RESULT: BLOCKED — failing gate(s): ${FAILED[*]}"
  exit 1
fi

if (( ${#SKIPPED[@]} > 0 )); then
  echo "RESULT: green (with skips: ${SKIPPED[*]}) — note the skips in the handoff's verification section."
  exit 0
fi

echo "RESULT: green — all gates passed."
exit 0
