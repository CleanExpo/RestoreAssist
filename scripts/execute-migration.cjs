const { PrismaClient } = require("@prisma/client")

async function main() {
  // The correct production database credentials for oxeiaavuspvpvanzcrjc from .env.local (Vercel-managed)
  const databaseUrl =
    "postgresql://postgres.oxeiaavuspvpvanzcrjc:SHev3MgZxkQyf2px@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  })

  try {
    console.log("Connecting to production database...")

    // First, check if the column already exists
    const checkResult = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name='User' AND column_name='hasPremiumInspectionReports'
    `

    if (checkResult && checkResult.length > 0) {
      console.log("✅ Column hasPremiumInspectionReports already exists!")
      return
    }

    console.log("Adding missing column hasPremiumInspectionReports...")

    // Add the column
    await prisma.$executeRaw`
      ALTER TABLE "User" ADD COLUMN "hasPremiumInspectionReports" BOOLEAN NOT NULL DEFAULT false
    `
    console.log("✅ Column added successfully!")

    // Add index for performance
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "User_hasPremiumInspectionReports_idx" ON "User"("hasPremiumInspectionReports")
    `
    console.log("✅ Index created successfully!")

    console.log("✅ Migration completed successfully!")
  } catch (error) {
    console.error("❌ Error:", error.message)
    if (error.code) console.error("Error code:", error.code)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
