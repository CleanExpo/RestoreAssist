const { PrismaClient } = require("@prisma/client");

const alternativeConnections = {
  "oxeiaavuspvpvanzcrjc - Direct Connection": {
    url: "postgresql://postgres:SHev3MgZxkQyf2px@db.oxeiaavuspvpvanzcrjc.supabase.co:5432/postgres?sslmode=require",
    name: "Direct connection (bypass pooler)"
  },
  "oxeiaavuspvpvanzcrjc - Pooler with Connection Limit": {
    url: "postgresql://postgres.oxeiaavuspvpvanzcrjc:SHev3MgZxkQyf2px@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require",
    name: "Pooler with connection_limit=1"
  },
  "oxeiaavuspvpvanzcrjc - Without pgbouncer": {
    url: "postgresql://postgres.oxeiaavuspvpvanzcrjc:SHev3MgZxkQyf2px@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres?sslmode=require",
    name: "Pooler on port 5432 (no pgbouncer)"
  },
  "oxeiaavuspvpvanzcrjc - Standard Pooler": {
    url: "postgresql://postgres.oxeiaavuspvpvanzcrjc:SHev3MgZxkQyf2px@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?sslmode=require",
    name: "Standard pooler (no pgbouncer)"
  }
};

async function testConnection(name, url) {
  console.log(`\n🔍 Testing: ${name}`);
  console.log(`   URL: ${url.replace(/:[^:@]+@/, ':****@')}`);

  const prisma = new PrismaClient({
    datasources: { db: { url } }
  });

  try {
    // Set a timeout for connection
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout (30s)')), 30000)
    );

    const connectionPromise = prisma.$connect();
    await Promise.race([connectionPromise, timeoutPromise]);

    console.log("   ✅ Connection successful!");

    // Quick test
    const userCount = await prisma.user.count();
    console.log(`   ✅ User table exists with ${userCount} users`);

    return { success: true, userCount };
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    try {
      await prisma.$disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
  }
}

async function main() {
  console.log("========================================================");
  console.log("TESTING ALTERNATIVE CONNECTION METHODS");
  console.log("========================================================");
  console.log("Trying different ways to reach oxeiaavuspvpvanzcrjc...\n");

  let successCount = 0;

  for (const [id, config] of Object.entries(alternativeConnections)) {
    const result = await testConnection(config.name, config.url);
    if (result.success) {
      successCount++;
      console.log(`   >>> WORKING! User count: ${result.userCount}`);
    }
  }

  console.log("\n" + "========================================================");
  console.log("RESULT");
  console.log("========================================================");

  if (successCount > 0) {
    console.log(`\n✅ Found ${successCount} working connection method(s)!`);
    console.log("Use the working method for all future database operations.");
  } else {
    console.log(`\n⚠️  NONE of the connection methods worked!`);
    console.log("\nThis indicates one of the following:");
    console.log("1. The Supabase project oxeiaavuspvpvanzcrjc no longer exists");
    console.log("2. The database password was changed/rotated");
    console.log("3. The database account was deleted");
    console.log("4. There's a network/firewall issue blocking all connections");
    console.log("5. The Supabase project is paused or in a restricted state");
  }
}

main().catch(console.error);
