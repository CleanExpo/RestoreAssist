import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // List the User table columns from prod
  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'User' ORDER BY column_name`,
  );
  console.log("=== Prod User columns ===");
  for (const c of cols) console.log("  " + c.column_name);

  // Pull ALL prod migrations
  const migrations = await prisma.$queryRawUnsafe<
    { migration_name: string; finished_at: Date | null }[]
  >(
    `SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name`,
  );
  console.log(`\n=== Prod migrations (${migrations.length} total) ===`);
  for (const m of migrations)
    console.log(`  ${m.finished_at ? "✓" : "✗"} ${m.migration_name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
