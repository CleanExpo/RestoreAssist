const { PrismaClient } = require("@prisma/client");

async function testConnection() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
      }
    }
  });

  try {
    console.log("🔄 Testing database connection after schema fix...\n");
    
    // Test simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log("✅ Basic query: SUCCESS");
    
    // Count users
    const userCount = await prisma.user.count();
    console.log(`✅ User count query: SUCCESS (${userCount} users in database)`);
    
    // Try to create a test user
    console.log("\n🔄 Testing user creation...");
    const testUser = await prisma.user.create({
      data: {
        name: "Test User",
        email: "test-" + Date.now() + "@example.com",
        password: "TestPassword123!",
        role: "USER",
        subscriptionStatus: "TRIAL",
        creditsRemaining: 3,
        totalCreditsUsed: 0,
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        hasPremiumInspectionReports: false
      }
    });
    
    console.log("✅ User creation: SUCCESS");
    console.log(`   - ID: ${testUser.id}`);
    console.log(`   - Email: ${testUser.email}`);
    console.log(`   - Created At: ${testUser.createdAt}`);
    
    // Query the user back
    const retrievedUser = await prisma.user.findUnique({
      where: { id: testUser.id }
    });
    
    console.log("✅ User retrieval: SUCCESS");
    console.log(`   - Name: ${retrievedUser.name}`);
    console.log(`   - Email: ${retrievedUser.email}`);
    console.log(`   - Updated At: ${retrievedUser.updatedAt}`);
    
    console.log("\n🎉 All database operations working correctly!");
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("Code:", error.code);
    if (error.meta) {
      console.error("Meta:", error.meta);
    }
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
