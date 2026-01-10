const { PrismaClient } = require("@prisma/client");

async function testConnection() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
      }
    },
    log: ['query', 'error', 'warn']
  });

  try {
    console.log("🔄 Testing Prisma connection with pooler URL...");
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log("✅ Connection successful!");
    console.log("Result:", result);
    
    // Count users in User table
    const userCount = await prisma.user.count();
    console.log(`\n📊 Users in database: ${userCount}`);
    
    // List users
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, createdAt: true }
    });
    console.log("\n📋 Existing users:");
    users.forEach(u => {
      console.log(`  - ${u.email} (${u.name}) - Created: ${u.createdAt}`);
    });
    
  } catch (error) {
    console.error("❌ Connection failed!");
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    console.error("Full error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
