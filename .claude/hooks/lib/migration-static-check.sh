#!/usr/bin/env bash
# migration-static-check.sh
#
# Fast deterministic prefilter for database-migration safety (review-dimensions
# #16). Runs BEFORE the LLM verifier on edited Prisma / Supabase migration SQL.
# Grounded in the destructive-DDL patterns that cause data loss or table locks.
#
# Receives edited paths (newline-separated) on stdin. Only *.sql files under a
# migrations dir are inspected; the file must exist.
#
# Output (stdout): JSON in the shape parse-report.sh / stop-verifier.sh expect.
#   - any hard violation  → status:"failed"
#   - only warnings       → status:"partial"
#   - nothing flagged     → status:"static-clean"  (go on to the LLM stage)
# Exit 0 always; the hook decides.

set -uo pipefail

PATHS=()
while IFS= read -r p; do
  [[ -z "$p" ]] && continue
  [[ ! -f "$p" ]] && continue
  case "$p" in
    *migrations/*.sql|*migrations/*/*.sql) PATHS+=("$p") ;;
    *) ;;
  esac
done

if (( ${#PATHS[@]} == 0 )); then
  jq -n '{status:"static-clean", reason:"no migration SQL edited"}'
  exit 0
fi

failed=()
warned=()

first_match() {
  grep -inE "$1" "$2" 2>/dev/null | head -n1 | sed 's/[[:space:]]\+/ /g' | cut -c 1-200
}

add_fail() {
  failed+=("$(jq -nc --arg claim "$1" --arg evidence "$2" --arg why "$3" --arg path "$4" \
    '{claim:$claim, evidence:$evidence, why:$why, path:$path}')")
}
add_warn() {
  warned+=("$(jq -nc --arg claim "$1" --arg path "$2" '{claim:$claim, path:$path}')")
}

for p in "${PATHS[@]}"; do
  # ===== HARD: destructive DDL that risks data loss =====
  if grep -iqE '\bDROP[[:space:]]+TABLE\b' "$p"; then
    add_fail "Migration drops a table" "$(first_match '\bDROP[[:space:]]+TABLE\b' "$p")" \
      "DROP TABLE is irreversible data loss. Requires a two-step deprecation + explicit backup plan (review-dimensions #16)." "$p"
  fi
  if grep -iqE '\bDROP[[:space:]]+COLUMN\b' "$p"; then
    add_fail "Migration drops a column" "$(first_match '\bDROP[[:space:]]+COLUMN\b' "$p")" \
      "DROP COLUMN loses data and breaks rollback. Use the two-step (stop writing → backfill → drop in a later release) pattern." "$p"
  fi
  if grep -iqE '\bTRUNCATE\b' "$p"; then
    add_fail "Migration truncates a table" "$(first_match '\bTRUNCATE\b' "$p")" \
      "TRUNCATE wipes all rows. Never in a forward migration without an explicit, reviewed data plan." "$p"
  fi
  if grep -iqE '\bALTER[[:space:]]+COLUMN\b.*\bTYPE\b' "$p"; then
    add_fail "Migration changes a column type" "$(first_match '\bALTER[[:space:]]+COLUMN\b.*\bTYPE\b' "$p")" \
      "ALTER COLUMN ... TYPE rewrites the table and takes an ACCESS EXCLUSIVE lock — blocks all reads/writes on large tables. Stage via a new column + backfill." "$p"
  fi

  # ===== WARN: lock / drift risks worth a second look =====
  if grep -iqE '\bCREATE[[:space:]]+(UNIQUE[[:space:]]+)?INDEX\b' "$p" \
     && ! grep -iqE '\bCREATE[[:space:]]+(UNIQUE[[:space:]]+)?INDEX[[:space:]]+CONCURRENTLY\b' "$p"; then
    add_warn "CREATE INDEX without CONCURRENTLY (locks writes while building)" "$p"
  fi
  if grep -iqE '\bDROP[[:space:]]+POLICY\b' "$p" && ! grep -iqE '\bDROP[[:space:]]+POLICY[[:space:]]+IF[[:space:]]+EXISTS\b' "$p"; then
    add_warn "DROP POLICY without IF EXISTS (non-idempotent; fails on re-run)" "$p"
  fi
done

n_fail=${#failed[@]}
n_warn=${#warned[@]}

if (( n_fail > 0 )); then
  feedback="Database migration safety check found hard violations:"$'\n'
  for f in "${failed[@]}"; do
    feedback+=$'\n'"- $(echo "$f" | jq -r '.path')"$'\n'"  $(echo "$f" | jq -r '.claim')"$'\n'"  Evidence: $(echo "$f" | jq -r '.evidence')"$'\n'"  Why: $(echo "$f" | jq -r '.why')"$'\n'
  done
  jq -n --argjson failed "$(printf '%s\n' "${failed[@]}" | jq -s '.')" \
    --arg feedback "$feedback" --argjson total "$((n_fail + n_warn))" --argjson nf "$n_fail" \
    '{status:"failed", confidence:"high", claims_total:$total, claims_verified:0, claims_failed:$nf,
      claims_unverified:0, failed:$failed, feedback:$feedback}'
  exit 0
fi

if (( n_warn > 0 )); then
  jq -n --argjson warned "$(printf '%s\n' "${warned[@]}" | jq -s '.')" --argjson nw "$n_warn" \
    '{status:"partial", confidence:"medium", claims_total:$nw, warnings:$warned}'
  exit 0
fi

jq -n '{status:"static-clean", reason:"no destructive DDL in edited migrations"}'
exit 0
