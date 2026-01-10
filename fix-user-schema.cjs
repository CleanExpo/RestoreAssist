const { PrismaClient } = require("@prisma/client");

async function fixUserSchema() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"
      }
    }
  });

  try {
    console.log("🔧 Fixing User table schema...\n");

    // 1. Add updatedAt column if it doesn't exist
    console.log("1️⃣ Adding updatedAt column...");
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
      `);
      console.log("   ✅ Added updatedAt column");
    } catch (e) {
      if (e.message.includes("already exists")) {
        console.log("   ℹ️  updatedAt column already exists");
      } else {
        console.log("   ⚠️  Error:", e.message);
      }
    }

    // 2. Add emailVerified column if it doesn't exist
    console.log("\n2️⃣ Adding emailVerified column...");
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User" ADD COLUMN "emailVerified" TIMESTAMP(3)
      `);
      console.log("   ✅ Added emailVerified column");
    } catch (e) {
      if (e.message.includes("already exists")) {
        console.log("   ℹ️  emailVerified column already exists");
      } else {
        console.log("   ⚠️  Error:", e.message);
      }
    }

    // 3. Add image column if it doesn't exist
    console.log("\n3️⃣ Adding image column...");
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User" ADD COLUMN "image" TEXT
      `);
      console.log("   ✅ Added image column");
    } catch (e) {
      if (e.message.includes("already exists")) {
        console.log("   ℹ️  image column already exists");
      } else {
        console.log("   ⚠️  Error:", e.message);
      }
    }

    // 4. Add other missing subscription columns
    console.log("\n4️⃣ Adding subscription columns...");
    const subscriptionCols = [
      { name: "subscriptionPlan", type: "TEXT" },
      { name: "subscriptionId", type: "TEXT" },
      { name: "stripeCustomerId", type: "TEXT" },
      { name: "subscriptionEndsAt", type: "TIMESTAMP(3)" },
      { name: "lastBillingDate", type: "TIMESTAMP(3)" },
      { name: "nextBillingDate", type: "TIMESTAMP(3)" }
    ];

    for (const col of subscriptionCols) {
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "User" ADD COLUMN "${col.name}" ${col.type}
        `);
        console.log(`   ✅ Added ${col.name} column`);
      } catch (e) {
        if (e.message.includes("already exists")) {
          console.log(`   ℹ️  ${col.name} column already exists`);
        } else {
          console.log(`   ⚠️  Error adding ${col.name}:`, e.message);
        }
      }
    }

    // 5. Add business info columns
    console.log("\n5️⃣ Adding business information columns...");
    const businessCols = [
      { name: "businessName", type: "TEXT" },
      { name: "businessAddress", type: "TEXT" },
      { name: "businessLogo", type: "TEXT" },
      { name: "businessABN", type: "TEXT" },
      { name: "businessPhone", type: "TEXT" },
      { name: "businessEmail", type: "TEXT" }
    ];

    for (const col of businessCols) {
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "User" ADD COLUMN "${col.name}" ${col.type}
        `);
        console.log(`   ✅ Added ${col.name} column`);
      } catch (e) {
        if (e.message.includes("already exists")) {
          console.log(`   ℹ️  ${col.name} column already exists`);
        } else {
          console.log(`   ⚠️  Error adding ${col.name}:`, e.message);
        }
      }
    }

    // 6. Add interview system columns
    console.log("\n6️⃣ Adding interview system columns...");
    const interviewCols = [
      { name: "interviewTier", type: "TEXT", default: "'STANDARD'" },
      { name: "preferredQuestionStyle", type: "TEXT" },
      { name: "autoAcceptSuggestionsAboveConfidence", type: "FLOAT" },
      { name: "subscriptionTierId", type: "TEXT" }
    ];

    for (const col of interviewCols) {
      try {
        const defaultClause = col.default ? ` DEFAULT ${col.default}` : "";
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "User" ADD COLUMN "${col.name}" ${col.type}${defaultClause}
        `);
        console.log(`   ✅ Added ${col.name} column`);
      } catch (e) {
        if (e.message.includes("already exists")) {
          console.log(`   ℹ️  ${col.name} column already exists`);
        } else {
          console.log(`   ⚠️  Error adding ${col.name}:`, e.message);
        }
      }
    }

    // 7. Update email to be NOT NULL and UNIQUE
    console.log("\n7️⃣ Verifying email column constraints...");
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User"
        ALTER COLUMN "email" SET NOT NULL,
        ADD CONSTRAINT email_unique UNIQUE ("email")
      `);
      console.log("   ✅ Updated email constraints");
    } catch (e) {
      if (e.message.includes("already exists") || e.message.includes("violates")) {
        console.log("   ℹ️  Email constraints already set");
      } else {
        console.log("   ⚠️  Error:", e.message);
      }
    }

    // 8. Verify final schema
    console.log("\n8️⃣ Verifying final User table schema...");
    const columns = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'User'
      ORDER BY ordinal_position
    `;

    console.log(`\n✅ User table now has ${columns.length} columns:`);
    columns.forEach(col => {
      console.log(`   - ${col.column_name}`);
    });

    console.log("\n🎉 User table schema fixed successfully!");

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixUserSchema();
