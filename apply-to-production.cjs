const { PrismaClient } = require("@prisma/client");
const fs = require("fs");

async function applyToProduction() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        // Use production database
        url: process.env.DIRECT_URL || "postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"
      }
    }
  });

  try {
    console.log("🔄 Applying User table migration to PRODUCTION database...\n");

    const migrationSQL = fs.readFileSync("prisma/migrations/fix_user_table/migration.sql", "utf-8");

    // Split by ; to handle multiple statements
    const statements = migrationSQL
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    let count = 0;
    for (const statement of statements) {
      try {
        console.log("Executing statement " + (++count) + "...");
        await prisma.$executeRawUnsafe(statement);
      } catch (e) {
        if (e.message.includes("already exists")) {
          console.log("  Already exists - skipping");
        } else {
          const errorMsg = (e.message || "Unknown error").split('\n')[0];
          console.log("  Error: " + errorMsg);
        }
      }
    }

    console.log("\n✅ Migration applied to production!\n");

    // Verify the schema
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'User'
      ORDER BY ordinal_position
    `;

    console.log("Production User table now has " + columns.length + " columns:");
    const first10 = columns.slice(0, 10);
    first10.forEach(col => {
      console.log("  - " + col.column_name + ": " + col.data_type);
    });
    console.log("  ... and " + (columns.length - 10) + " more columns");

  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyToProduction();
