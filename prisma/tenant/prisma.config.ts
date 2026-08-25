import { defineConfig, env } from "prisma/config";

/**
 * Tenant-only Prisma CLI configuration.
 *
 * There is deliberately no DATABASE_URL/DIRECT_URL fallback: a missing tenant
 * URL must stop the command instead of silently selecting the control plane.
 * Paths are relative to this config file, keeping this migration history
 * physically separate from prisma/migrations.
 */
export default defineConfig({
  schema: "schema.prisma",
  migrations: {
    path: "migrations",
  },
  datasource: {
    url: env("TENANT_DATABASE_URL"),
  },
});
