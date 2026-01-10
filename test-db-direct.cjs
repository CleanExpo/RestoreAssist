const { PrismaClient } = require("@prisma/client");

async function testConnection() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"
      }
    }
  });

  try {
    console.log("🔄 Testing with DIRECT_URL (port 5432)...\n");

    // Try to create a test user
    const testUser = await prisma.user.create({
      data: {
        name: "Test User Direct",
        email: "test-direct-" + Date.now() + "@example.com",
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
    console.log(`   - Role: ${retrievedUser.role}`);
    console.log(`   - Updated At: ${retrievedUser.updatedAt}`);

    console.log("\n🎉 Database works with DIRECT_URL!");

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
