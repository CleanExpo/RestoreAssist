const { PrismaClient } = require("@prisma/client");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

async function migrateProdDatabase() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DIRECT_URL || process.env.DATABASE_URL
      }
    }
  });

  try {
    console.log("🔄 Starting production database migration...");
    console.log("📍 Connecting to:", process.env.DIRECT_URL?.split("@")[1] || "database");

    // Add missing User table columns
    console.log("\n📝 Adding missing User table columns...");

    // Check if columns exist first
    const tableInfo = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'User'
    `;

    const columnNames = tableInfo.map(col => col.column_name);
    console.log("📋 Current columns:", columnNames);

    // Add missing columns
    if (!columnNames.includes('addonReports')) {
      console.log("➕ Adding addonReports column...");
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "User" ADD COLUMN "addonReports" INTEGER DEFAULT 0`
      );
    }

    if (!columnNames.includes('monthlyReportsUsed')) {
      console.log("➕ Adding monthlyReportsUsed column...");
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "User" ADD COLUMN "monthlyReportsUsed" INTEGER DEFAULT 0`
      );
    }

    if (!columnNames.includes('monthlyResetDate')) {
      console.log("➕ Adding monthlyResetDate column...");
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "User" ADD COLUMN "monthlyResetDate" TIMESTAMP(3)`
      );
    }

    if (!columnNames.includes('signupBonusApplied')) {
      console.log("➕ Adding signupBonusApplied column...");
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "User" ADD COLUMN "signupBonusApplied" BOOLEAN DEFAULT false`
      );
    }

    if (!columnNames.includes('hasPremiumInspectionReports')) {
      console.log("➕ Adding hasPremiumInspectionReports column...");
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "User" ADD COLUMN "hasPremiumInspectionReports" BOOLEAN NOT NULL DEFAULT false`
      );
    }

    // Create index if not exists
    console.log("📑 Creating index for hasPremiumInspectionReports...");
    try {
      await prisma.$executeRawUnsafe(
        `CREATE INDEX "User_hasPremiumInspectionReports_idx" ON "User"("hasPremiumInspectionReports")`
      );
    } catch (e) {
      if (e.message.includes("already exists")) {
        console.log("✓ Index already exists");
      } else {
        throw e;
      }
    }

    console.log("\n✅ Migration completed successfully!");

    // Verify columns now exist
    const updatedColumns = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'User'
      ORDER BY ordinal_position
    `;

    console.log("\n📊 Updated User table columns:");
    updatedColumns.forEach(col => {
      console.log(`  ✓ ${col.column_name}`);
    });

  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    if (error.code === "P1000" || error.code === "P1001") {
      console.error("🔴 Database connection error - check DATABASE_URL");
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateProdDatabase();
