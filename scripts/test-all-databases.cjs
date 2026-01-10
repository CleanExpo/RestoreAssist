const { PrismaClient } = require("@prisma/client");

const databases = {
  oxeiaavuspvpvanzcrjc: {
    url: "postgresql://postgres.oxeiaavuspvpvanzcrjc:SHev3MgZxkQyf2px@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require",
    name: "oxeiaavuspvpvanzcrjc (REPORTED AS PRODUCTION)"
  },
  ithmbupvmriruprrdiob: {
    url: "postgresql://postgres.ithmbupvmriruprrdiob:KafwyuOTLegPb9uH@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true",
    name: "ithmbupvmriruprrdiob (Vercel config)"
  },
  stielawqvxnzd7c: {
    url: "postgresql://postgres:sTGCFxQ6QYYq0Fz8@db.stielawqvxnzd7c.supabase.co:5432/postgres?sslmode=require",
    name: "stielawqvxnzd7c (Migration scripts)"
  }
};

async function testDatabase(name, url) {
  console.log(`\n🔍 Testing: ${name}`);
  console.log(`URL: ${url.replace(/:[^:@]+@/, ':****@')}`);

  const prisma = new PrismaClient({
    datasources: { db: { url } }
  });

  try {
    // Test 1: Can we connect?
    await prisma.$connect();
    console.log("✅ Connection successful");

    // Test 2: Does User table exist?
    const userCount = await prisma.user.count();
    console.log(`✅ User table exists with ${userCount} users`);

    // Test 3: Get sample data
    if (userCount > 0) {
      const sampleUsers = await prisma.user.findMany({
        take: 3,
        select: { id: true, email: true, createdAt: true }
      });
      console.log("📊 Sample users:", sampleUsers);
    }

    // Test 4: Check schema
    const hasColumn = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name='User' AND column_name='hasPremiumInspectionReports'
    `;
    console.log(`✅ hasPremiumInspectionReports column: ${hasColumn.length > 0 ? "EXISTS" : "MISSING"}`);

    return { success: true, userCount, hasData: userCount > 0, hasColumn: hasColumn.length > 0 };
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log("========================================================");
  console.log("SUPABASE DATABASE TESTING");
  console.log("========================================================");

  const results = {};

  for (const [id, config] of Object.entries(databases)) {
    results[id] = await testDatabase(config.name, config.url);
  }

  console.log("\n" + "========================================================");
  console.log("SUMMARY");
  console.log("========================================================");

  let foundProduction = false;

  for (const [id, result] of Object.entries(results)) {
    console.log(`\n${id}:`);
    if (result.success) {
      console.log(`  Connection: ✅ SUCCESS`);
      console.log(`  User count: ${result.userCount}`);
      console.log(`  Has data: ${result.hasData ? "✅ YES" : "❌ NO"}`);
      console.log(`  Schema updated: ${result.hasColumn ? "✅ YES" : "❌ NO"}`);

      if (result.hasData) {
        console.log(`  🎯 >>> POTENTIAL PRODUCTION DATABASE <<<`);
        foundProduction = true;
      }
    } else {
      console.log(`  Connection: ❌ FAILED`);
      console.log(`  Error: ${result.error}`);
    }
  }

  console.log("\n" + "========================================================");
  console.log("CONCLUSION");
  console.log("========================================================");

  if (foundProduction) {
    const withData = Object.entries(results).filter(([_, r]) => r.success && r.hasData);
    console.log(`\n✅ Found ${withData.length} database(s) with production data:`);
    withData.forEach(([id, result]) => {
      console.log(`   - ${id} (${result.userCount} users)`);
    });
  } else {
    console.log(`\n⚠️  No databases with production data found!`);
    console.log(`\nSuccessfully connected to:`);
    const connected = Object.entries(results).filter(([_, r]) => r.success);
    if (connected.length > 0) {
      connected.forEach(([id]) => {
        console.log(`   - ${id} (but empty)`);
      });
    } else {
      console.log(`   None!`);
    }
  }
}

main().catch(console.error);
