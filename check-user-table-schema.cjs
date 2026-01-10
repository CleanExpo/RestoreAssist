const { PrismaClient } = require("@prisma/client");

async function checkSchema() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"
      }
    }
  });

  try {
    console.log("📋 Checking User table columns...\n");

    // Query information_schema to get all columns
    const columns = await prisma.$queryRaw`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'User'
      ORDER BY ordinal_position
    `;

    console.log("Current columns in User table:");
    console.log("─".repeat(80));
    columns.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? '✓ nullable' : '✗ required';
      const defaultValue = col.column_default ? `(default: ${col.column_default})` : '';
      console.log(col.column_name + " | " + col.data_type + " | " + nullable + " " + defaultValue);
    });

    console.log("\n✅ User table has " + columns.length + " columns");

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSchema();
