import { defineConfig } from "prisma/config";
import "dotenv/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: "postgresql://postgres:b6q4kWNS0t4OZAWK@db.oxeiaavuspvpvanzcrjc.supabase.co:5432/postgres" as string,
  },
});
