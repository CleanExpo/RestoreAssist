const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

async function testInsert() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"
      }
    }
  });

  try {
    console.log("🔄 Testing raw SQL insert...\n");

    const userId = crypto.randomBytes(12).toString('hex');
    const email = "test-sql-" + Date.now() + "@example.com";
    const now = new Date();

    console.log(`Using ID: ${userId}`);
    console.log(`Using Email: ${email}\n`);

    const result = await prisma.$executeRawUnsafe(`
      INSERT INTO "User" (
        "id", "email", "name", "password", "role", "created_at", "updatedAt",
        "subscriptionStatus", "creditsRemaining", "totalCreditsUsed",
        "trialEndsAt", "hasPremiumInspectionReports", "interviewTier"
      ) VALUES (
        $1, $2, 'Test SQL User', 'hashedpass123', 'USER', $3, $4,
        'TRIAL', 3, 0, $5, false, 'STANDARD'
      )
    `, userId, email, now, now, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    console.log("✅ Raw SQL insert successful!");
    console.log("   Rows affected:", result);

    // Now try to read it back
    const user = await prisma.user.findUnique({
      where: { email: email }
    });

    console.log("\n✅ User retrieval successful!");
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Name: ${user.name}`);

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testInsert();
