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
#   --full     install deps first (pnpm install), then the standard gates plus
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

gate_deps()      { command -v pnpm >/dev/null 2>&1 || { echo "pnpm not on PATH"; return 77; }; pnpm install --frozen-lockfile; }
gate_generated() { need_deps && pnpm prisma:generate; }
gate_type()      { need_deps && pnpm type-check; }
gate_lint()      { need_deps && pnpm lint; }
gate_emoji()     { need_deps && pnpm check:no-emoji; }
gate_build_nodb(){ need_deps && pnpm validate:next-build-no-db; }
gate_build_full(){ need_deps && pnpm build; }
gate_security()  { need_deps && pnpm security:scan; }

gate_audits() {
  need_deps || return 77
  local rc=0
  pnpm audit:ai  || rc=1
  pnpm audit:api || rc=1
  pnpm audit:rls || rc=1
  return $rc
}

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
    run_gate "build (no-db)"   gate_build_nodb
    run_gate "security-scan"   gate_security
    ;;
  full)
    run_gate "deps"            gate_deps
    run_gate "generated-files" gate_generated
    run_gate "type-check"      gate_type
    run_gate "lint"            gate_lint
    run_gate "no-emoji"        gate_emoji
    run_gate "build"           gate_build_full
    run_gate "security-scan"   gate_security
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
