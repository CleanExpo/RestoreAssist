import { defineConfig } from "prisma/config";
import "dotenv/config";

// Use process.env directly to avoid PrismaConfigEnvError during postinstall
// (schema.prisma already enforces DATABASE_URL at runtime via env("DATABASE_URL"))
// RA-1940 / Prisma 7: url + directUrl moved from schema.prisma to here.
// DIRECT_URL = Supabase direct 5432 (needed for migrate deploy advisory locks).
// DATABASE_URL = 6543 transaction pooler (runtime queries).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ?? "postgresql://localhost:5432/restoreassist",
    // directUrl moved to prisma config but Prisma 7 datasource type only
    // accepts url + shadowDatabaseUrl. Direct connection is handled via url.
  },
});
