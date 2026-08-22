#!/usr/bin/env sh
# Build pipeline (Vercel-only; DigitalOcean App Platform was decommissioned in 85ea27d8):
#   1. `prisma migrate deploy` runs on production builds only. Vercel
#      Preview/Development deployments don't see DATABASE_URL, so migrate deploy
#      would P1012 — those envs skip it.
#   2. RA-1807 FAIL-CLOSED: migrate DDL silently no-ops against Supabase's :6543
#      transaction pooler, so we HARD-FAIL the build when DIRECT_URL points at the
#      :6543 pooler. A direct :5432 connection passes (including CI's ephemeral
#      :5432 where DIRECT_URL == DATABASE_URL). (This was previously a non-fatal
#      warning — the silent no-op that a warning can't stop is how prod drifted.)
#   3. `prisma generate` always runs — only needs the schema, no env resolution.
#   4. `next build` runs last.
set -e

echo "[build] starting RestoreAssist build pipeline (prisma generate → migrate deploy when applicable → next build)"
echo "[build] NODE_ENV=${NODE_ENV:-unset} VERCEL_ENV=${VERCEL_ENV:-unset} HEROKU=${HEROKU:-unset}"

export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

npx prisma generate

case "$VERCEL_ENV" in
  preview|development)
    echo "[build] VERCEL_ENV=$VERCEL_ENV — skipping prisma migrate deploy (no prod DB in this env)"
    ;;
  *)
    if [ -z "$DATABASE_URL" ]; then
      # Cross-verifier finding (codex, PR #1972): lib/prisma.ts is now lazy, so a
      # production build without DATABASE_URL would SUCCEED and then 500 at the
      # first query. Fail the build instead — on Vercel production this env var
      # is mandatory. Local 'next build' without env (VERCEL_ENV unset) stays
      # allowed for hermetic build verification.
      if [ "$VERCEL_ENV" = "production" ]; then
        echo "[build] ERROR: VERCEL_ENV=production but DATABASE_URL is unset — refusing to ship a build that would 500 at first query (lazy PrismaClient)." >&2
        exit 1
      fi
      echo "[build] DATABASE_URL unset — skipping prisma migrate deploy (probably a local 'next build' without env)"
    else
      # RA-1807 fail-closed pre-flight: the drift vector is the :6543 TRANSACTION
      # POOLER, on which `prisma migrate deploy` DDL silently no-ops while
      # _prisma_migrations records success. Fail ONLY on that. DIRECT_URL falls
      # back to DATABASE_URL (line 15) when unset, so an unset DIRECT_URL against a
      # pooler DATABASE_URL is still caught here — while a direct :5432 connection
      # is fine even when DIRECT_URL == DATABASE_URL (CI's single ephemeral :5432,
      # or any host with no separate pooler URL). Do NOT reject equality per se.
      if echo "$DIRECT_URL" | grep -q ':6543'; then
        echo "[build] ERROR: DIRECT_URL points at the :6543 transaction pooler — 'prisma migrate deploy' DDL silently no-ops there (the RA-1807 drift root cause)." >&2
        echo "[build]        Set DIRECT_URL to the direct :5432 session connection on the deploy host, then redeploy." >&2
        exit 1
      fi
      # Heroku / managed Postgres: Node pg treats sslmode=require as verify-full,
      # which fails on self-signed chains (SELF_SIGNED_CERT_IN_CHAIN). Prisma
      # Heroku docs: use sslmode=no-verify. Scoped to this build shell only —
      # does not rewrite Config Vars / runtime app env permanently.
      eval "$(node scripts/lib/pg-ssl-for-migrate.mjs --export-shell)"

      # Capture migrate output for P3009 / P3018 / 42710 / 3F000 recovery without wiping the DB.
      # Partial mid-apply failures (e.g. enum created, then auth.uid() RLS / schema "auth"
      # does not exist on non-Supabase Postgres) leave a failed row + duplicate objects on retry.
      migrate_log="$(mktemp "${TMPDIR:-/tmp}/prisma-migrate-XXXXXX.log")"

      # Extract failed migration folder name from Prisma deploy / resolve logs.
      extract_failed_migration() {
        _log="$1"
        _mig="$(
          sed -n 's/.*Migration name: \([0-9]\{8,\}_[A-Za-z0-9_]*\).*/\1/p' "$_log" | head -1
        )"
        if [ -z "$_mig" ]; then
          _mig="$(
            sed -n 's/.*The `\([0-9]\{8,\}_[A-Za-z0-9_]*\)` migration.*/\1/p' "$_log" | head -1
          )"
        fi
        if [ -z "$_mig" ]; then
          _mig="$(
            grep -oE '[0-9]{14}_[A-Za-z0-9_]+' "$_log" | head -1
          )"
        fi
        printf '%s' "$_mig"
      }

      # Recoverable: failed migration row (P3009/P3018), duplicate objects (42710),
      # or missing schema (3F000 — e.g. schema "auth" does not exist).
      migrate_failure_recoverable() {
        grep -qE 'P3009|P3018|42710|3F000|schema "auth" does not exist|already exists|duplicate_object' "$1"
      }

      run_migrate_deploy() {
        npx prisma migrate deploy >"$migrate_log" 2>&1
      }

      if ! run_migrate_deploy; then
        cat "$migrate_log" >&2
        if migrate_failure_recoverable "$migrate_log"; then
          failed_mig="$(extract_failed_migration "$migrate_log")"
          if [ -z "$failed_mig" ]; then
            echo "[build] ERROR: migrate failed with P3009/P3018/42710/3F000 but could not parse migration name — refusing to guess." >&2
            rm -f "$migrate_log"
            exit 1
          fi

          echo "[build] migrate recover: detected failure on '$failed_mig' (P3009/P3018/42710/3F000)" >&2

          # Prefer finishing partial applies: rolled-back + re-apply lets idempotent
          # SQL create missing tables/indexes after enums already exist.
          echo "[build] migrate recover: prisma migrate resolve --rolled-back $failed_mig" >&2
          if ! npx prisma migrate resolve --rolled-back "$failed_mig"; then
            echo "[build] ERROR: migrate resolve --rolled-back failed for $failed_mig" >&2
            rm -f "$migrate_log"
            exit 1
          fi

          if ! run_migrate_deploy; then
            cat "$migrate_log" >&2
            # Objects already fully present — mark applied and continue the chain.
            if grep -qE '42710|already exists|duplicate_object' "$migrate_log"; then
              failed_mig2="$(extract_failed_migration "$migrate_log")"
              [ -n "$failed_mig2" ] && failed_mig="$failed_mig2"
              echo "[build] migrate recover: duplicate objects remain — prisma migrate resolve --applied $failed_mig" >&2
              if ! npx prisma migrate resolve --applied "$failed_mig"; then
                echo "[build] ERROR: migrate resolve --applied failed for $failed_mig" >&2
                rm -f "$migrate_log"
                exit 1
              fi
              if ! run_migrate_deploy; then
                cat "$migrate_log" >&2
                echo "[build] ERROR: migrate deploy still failing after --applied recovery for $failed_mig" >&2
                rm -f "$migrate_log"
                exit 1
              fi
            else
              if grep -q 'P3009' "$migrate_log"; then
                echo "[build] ERROR: Prisma P3009 persists after resolve — this build will NOT wipe the database." >&2
                echo "[build]        For a fresh/non-critical app DB, reset then redeploy:" >&2
                echo "[build]          CONFIRM_DATA_LOSS=yes DATABASE_URL='postgresql://…' ./scripts/prisma-reset-for-baseline.sh" >&2
              fi
              rm -f "$migrate_log"
              exit 1
            fi
          fi
          echo "[build] migrate recover: succeeded after resolve for $failed_mig"
        else
          rm -f "$migrate_log"
          exit 1
        fi
      fi
      cat "$migrate_log"
      rm -f "$migrate_log"
      # Schema drift smoke test — guards against the failure mode where
      # `prisma migrate deploy` reports success but the DDL silently no-ops.
      # We hit this on 2026-05-12 with 24 columns missing across 7 tables.
      #
      # Fail-closed by default (CI / local). On Heroku (DYNO / HEROKU_APP_NAME),
      # post-squash DBs can report residual drift or TLS/connect flakes that
      # must not block deploys. Default: warn + continue on Heroku. Escape hatches:
      #   SKIP_SCHEMA_DRIFT_CHECK=1 — always warn+continue (any host)
      #   SKIP_SCHEMA_DRIFT_CHECK=0 — force fail-closed even on Heroku
      skip_drift="${SKIP_SCHEMA_DRIFT_CHECK:-}"
      if [ -z "$skip_drift" ] && { [ -n "${DYNO:-}" ] || [ -n "${HEROKU_APP_NAME:-}" ]; }; then
        skip_drift=1
        echo "[build] Heroku detected (DYNO/HEROKU_APP_NAME) — schema drift check is warn-only (SKIP_SCHEMA_DRIFT_CHECK unset; set =0 to fail-closed)"
      fi
      if [ "$skip_drift" = "1" ]; then
        if ! SKIP_SCHEMA_DRIFT_CHECK=1 node scripts/check-schema-drift.mjs; then
          echo "[build] WARN: schema drift check exited non-zero with SKIP_SCHEMA_DRIFT_CHECK=1 — continuing deploy" >&2
        fi
      else
        node scripts/check-schema-drift.mjs
      fi
    fi
    ;;
esac

next build
