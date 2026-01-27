import { defineConfig, env } from "prisma/config";
import "dotenv/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use direct connection (not PgBouncer) for migrations
    url: env("DIRECT_URL") || env("DATABASE_URL"),
  },
});
