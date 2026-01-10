import { PrismaClient } from "@prisma/client"

async function main() {
  const connectionString =
    "postgresql://postgres:SHev3MgZxkQyf2px@db.oxeiaavuspvpvanzcrjc.supabase.co:5432/postgres?sslmode=require"

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: connectionString,
      },
    },
  })

  try {
    console.log("Checking if User table exists...")
    const result = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public' AND table_name='User'
    `
    console.log("User table exists:", (result as any[]).length > 0)

    if ((result as any[]).length > 0) {
      console.log("Checking for hasPremiumInspectionReports column...")
      const columnCheck = await prisma.$queryRaw`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='User' AND column_name='hasPremiumInspectionReports'
      `
      console.log(
        "Column exists:",
        (columnCheck as any[]).length > 0
      )
    }
  } catch (error) {
    console.error("Error:", (error as any).message)
  } finally {
    await prisma.$disconnect()
  }
}

main()
