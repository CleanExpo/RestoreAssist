#!/usr/bin/env bash
# Apply Prisma migrations on a developer laptop Postgres instance.
#
# Mirrors the CONCURRENTLY pre-resolve list from scripts/ci/test-with-db.sh,
# then runs the replay-index recovery helper when a prior `migrate deploy`
# left P3009 on localhost.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

db_url="${DIRECT_URL:-${DATABASE_URL:-}}"
case "$db_url" in
  postgresql://*@localhost:*/*|postgresql://*@127.0.0.1:*/*|postgres://*@localhost:*/*|postgres://*@127.0.0.1:*/*)
    ;;
  *)
    echo "db:migrate:local only runs against localhost Postgres (DATABASE_URL)." >&2
    exit 2
    ;;
esac

echo "==> Unblock replay-index migration if needed"
if npx tsx scripts/dev-local-migrate-unblock.ts --check; then
  npx tsx scripts/dev-local-migrate-unblock.ts --ensure-index
else
  replay_mig="20260828213100_job_file_audit_intake_replay_guard_index"
  echo "Recovering failed migration ${replay_mig}…"
  resolve_flag="--rolled-back"
  npx prisma migrate resolve "${resolve_flag}" "${replay_mig}"
  npx tsx scripts/dev-local-migrate-unblock.ts --ensure-index
  resolve_flag="--applied"
  npx prisma migrate resolve "${resolve_flag}" "${replay_mig}"
fi

echo "==> Pre-resolving CONCURRENTLY migrations (matches CI)"
for mig in \
  20260407_n1_performance_indexes \
  20260407_perf_composite_indexes \
  20260516010000_inspection_close_terminal_index \
  20260828213100_job_file_audit_intake_replay_guard_index; do
  npx prisma migrate resolve --applied "$mig" >/dev/null 2>&1 || true
done

echo "==> Applying migrations"
npx prisma migrate deploy

echo "Local database migrations are up to date."
