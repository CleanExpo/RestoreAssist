import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 — DB URL lives here, not in schema.prisma.
 *
 * Prefer DIRECT_URL for CLI/migrate (Supabase session :5432). Falling back to
 * DATABASE_URL is fine for local Postgres; production builds still hard-fail
 * when DIRECT_URL points at the :6543 pooler (scripts/build.sh).
 */
const migrateUrl =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  "postgresql://localhost:5432/restoreassist";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // env() is type-safe when the var is always set; use migrateUrl so local
    // postinstall / validate still works without a full .env.
    url: migrateUrl,
  },
});
