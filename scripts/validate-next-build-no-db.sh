#!/usr/bin/env sh
set -eu

# RestoreAssist database-free Next validation guard.
# This command is intentionally NOT production build readiness.
# It must not replace or weaken the existing production `npm run build` path.
# It must not call npm run build, scripts/build.sh, Prisma migrate/deploy, schema drift checks,
# database commands, deployment commands, secret files, or external services.

# Static self-check (RA-7773), placed first so that no line after it runs unless it passes.
# An executable line is any line of this file that is non-empty and does not start with `#`
# once leading and trailing spaces and tabs are trimmed. Those lines must equal the `#| `
# lines below exactly: same lines, same order, whole-line byte match. Any added, removed,
# moved or edited line is refused with exit 2, including a `;`-joined command, a trailing
# `# comment`, a `\` continuation, a heredoc, and a carriage return (CRLF is not trimmed).
# Limits: a line added ABOVE this block runs before the check does, and one edit can change
# a line and its `#| ` copy together. scripts/__tests__/validate-next-build-no-db-allowlist.test.ts
# pins the same lines from outside this file; a legitimate change updates all three.
#| set -eu
#| if [ ! -f scripts/validate-next-build-no-db.sh ]; then
#| echo "Refusing: validation wrapper missing." >&2
#| exit 2
#| fi
#| wrapper_lines=$(awk '{ sub(/^[ \t]+/, ""); sub(/[ \t]+$/, ""); if ($0 != "" && substr($0, 1, 1) != "#") print }' scripts/validate-next-build-no-db.sh)
#| allowed_lines=$(sed -n 's/^#| //p' scripts/validate-next-build-no-db.sh)
#| if [ "$wrapper_lines" != "$allowed_lines" ]; then
#| echo "Refusing: wrapper executable lines differ from its #| allowlist." >&2
#| exit 2
#| fi
#| echo "validate:next-build-no-db: database-free validation mode"
#| echo "validate:next-build-no-db: NOT production build readiness"
#| if [ -n "${DATABASE_URL:-}" ] || [ -n "${DIRECT_URL:-}" ]; then
#| echo "Refusing: database URLs are present but this validation mode must be database-free." >&2
#| exit 2
#| fi
#| if [ -n "${VERCEL_ENV:-}" ] || [ -n "${DO_APP_PLATFORM:-}" ]; then
#| echo "Refusing: deployment context detected; this command is local no-db validation only." >&2
#| exit 2
#| fi
#| if [ ! -f package.json ]; then
#| echo "Refusing: package.json not found at repository root." >&2
#| exit 2
#| fi
#| if ! grep -q '"validate:next-build-no-db": "sh scripts/validate-next-build-no-db.sh"' package.json; then
#| echo "Refusing: package.json does not expose the expected validation command." >&2
#| exit 2
#| fi
#| echo "validate:next-build-no-db: guardrails passed"
#| echo "validate:next-build-no-db: no database, Prisma migrate, build, deploy, secret, or external path entered"
if [ ! -f scripts/validate-next-build-no-db.sh ]; then
  echo "Refusing: validation wrapper missing." >&2
  exit 2
fi

wrapper_lines=$(awk '{ sub(/^[ \t]+/, ""); sub(/[ \t]+$/, ""); if ($0 != "" && substr($0, 1, 1) != "#") print }' scripts/validate-next-build-no-db.sh)
allowed_lines=$(sed -n 's/^#| //p' scripts/validate-next-build-no-db.sh)
if [ "$wrapper_lines" != "$allowed_lines" ]; then
  echo "Refusing: wrapper executable lines differ from its #| allowlist." >&2
  exit 2
fi

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
# Guardrail: never call scripts/build.sh, npm run build, next build, Prisma migrate/deploy,
# prisma db push/pull, prisma migrate resolve, or scripts/check-schema-drift.mjs.

if [ ! -f package.json ]; then
  echo "Refusing: package.json not found at repository root." >&2
  exit 2
fi

if ! grep -q '"validate:next-build-no-db": "sh scripts/validate-next-build-no-db.sh"' package.json; then
  echo "Refusing: package.json does not expose the expected validation command." >&2
  exit 2
fi

echo "validate:next-build-no-db: guardrails passed"
echo "validate:next-build-no-db: no database, Prisma migrate, build, deploy, secret, or external path entered"
