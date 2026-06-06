#!/usr/bin/env sh
set -eu

# RestoreAssist database-free Next validation guard.
# This command is intentionally NOT production build readiness.
# It must not replace or weaken the existing production `pnpm build` path.
# It must not call pnpm build, scripts/build.sh, Prisma migrate/deploy, schema drift checks,
# database commands, deployment commands, secret files, or external services.

echo "validate:next-build-no-db: database-free validation mode"
echo "validate:next-build-no-db: NOT production build readiness"

# Guardrail: this path must not require or accept database URLs.
# The command should run with database variables absent and must not open secrets.
if [ -n "${DATABASE_URL:-}" ] || [ -n "${DIRECT_URL:-}" ]; then
  echo "Refusing: database URLs are present but this validation mode must be database-free." >&2
  exit 2
fi

# Guardrail: deployment-context logic is not part of this validation mode.
# Do not branch on VERCEL_ENV, DO_APP_PLATFORM, production deploy state, or remote services.
if [ -n "${VERCEL_ENV:-}" ] || [ -n "${DO_APP_PLATFORM:-}" ]; then
  echo "Refusing: deployment context detected; this command is local no-db validation only." >&2
  exit 2
fi

# Guardrail: never read .env files or secret stores in this command.
# Guardrail: never call scripts/build.sh, pnpm build, next build, Prisma migrate/deploy,
# prisma db push/pull, prisma migrate resolve, or scripts/check-schema-drift.mjs.

if [ ! -f package.json ]; then
  echo "Refusing: package.json not found at repository root." >&2
  exit 2
fi

if [ ! -f scripts/validate-next-build-no-db.sh ]; then
  echo "Refusing: validation wrapper missing." >&2
  exit 2
fi

if ! grep -q '"validate:next-build-no-db": "sh scripts/validate-next-build-no-db.sh"' package.json; then
  echo "Refusing: package.json does not expose the expected validation command." >&2
  exit 2
fi

# Static self-checks: ensure this wrapper does not contain executable calls to forbidden paths.
# Comments may document forbidden commands, so only obvious command invocations are checked.
if grep -Eq '^[[:space:]]*(pnpm[[:space:]]+build|next[[:space:]]+build|sh[[:space:]]+scripts/build\.sh|pnpm[[:space:]]+exec[[:space:]]+prisma|prisma[[:space:]]+(migrate|db)|node[[:space:]]+scripts/check-schema-drift\.mjs)' scripts/validate-next-build-no-db.sh; then
  echo "Refusing: forbidden executable validation path detected in wrapper." >&2
  exit 2
fi

echo "validate:next-build-no-db: guardrails passed"
echo "validate:next-build-no-db: no database, Prisma migrate, build, deploy, secret, or external path entered"
