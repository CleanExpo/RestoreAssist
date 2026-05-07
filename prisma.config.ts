import { defineConfig } from "prisma/config";
import "dotenv/config";

// Use process.env directly to avoid PrismaConfigEnvError during postinstall
// (schema.prisma already enforces DATABASE_URL at runtime via env("DATABASE_URL"))
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ?? "postgresql://localhost:5432/restoreassist",
  },
});
