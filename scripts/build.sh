#!/usr/bin/env sh
# Builds are deliberately database-independent and never mutate a database.
# Production migration is a separately approved, exact-revision operation.
set -eu

echo "[build] generating Prisma client (no database connection)"
npx --no-install prisma generate

echo "[build] building Next.js (database migrations are not run here)"
exec npx --no-install next build
