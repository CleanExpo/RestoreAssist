const { PrismaClient } = require("@prisma/client");

async function checkSchema() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres:l9EtTU9JsvJCpMNL@db.udooysjajglluvuxkijp.supabase.co:6543/postgres?sslmode=require"
      }
    }
  });

  try {
    console.log("🔍 Checking User table structure...");

    // Check if table exists
    const tableCheck = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'User'
      ) as exists;
    `;

    console.log("📋 Table exists:", tableCheck[0].exists);

    if (tableCheck[0].exists) {
      // Get all columns
      const columns = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'User'
        ORDER BY ordinal_position;
      `;

      console.log("\n📊 Current User table columns:");
      columns.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable ? 'NULLABLE' : 'NOT NULL'}`);
      });

      // Check for specific missing columns
      const hasPremium = columns.find(c => c.column_name === 'hasPremiumInspectionReports');
      console.log(`\n❓ hasPremiumInspectionReports column: ${hasPremium ? '✅ EXISTS' : '❌ MISSING'}`);
    }

    // Try to count users
    const userCount = await prisma.user.count();
    console.log(`\n👥 User count: ${userCount}`);

  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.code === "P1000" || error.code === "P1001") {
      console.error("🔴 Database connection failed!");
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkSchema();
