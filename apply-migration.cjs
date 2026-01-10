const { PrismaClient } = require("@prisma/client");
const fs = require("fs");

async function applyMigration() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"
      }
    }
  });

  try {
    console.log("🔄 Applying User table migration...\n");

    const migrationSQL = fs.readFileSync("prisma/migrations/fix_user_table/migration.sql", "utf-8");

    // Split by ; to handle multiple statements
    const statements = migrationSQL
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      console.log("Executing statement...");
      await prisma.$executeRawUnsafe(statement);
    }

    console.log("\n✅ Migration applied successfully!\n");

    // Verify the schema
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'User'
      ORDER BY ordinal_position
    `;

    console.log("User table columns:");
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();
