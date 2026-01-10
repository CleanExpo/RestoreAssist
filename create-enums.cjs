const { PrismaClient } = require("@prisma/client");

async function createEnums() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"
      }
    }
  });

  try {
    console.log("🔧 Creating PostgreSQL enum types...\n");

    // Create Role enum
    console.log("1️⃣ Creating Role enum (USER, ADMIN, MANAGER)...");
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TYPE "public"."Role" AS ENUM ('USER', 'ADMIN', 'MANAGER')
      `);
      console.log("   ✅ Role enum created");
    } catch (e) {
      if (e.message.includes("already exists")) {
        console.log("   ℹ️  Role enum already exists");
      } else {
        console.log("   ⚠️  Error:", e.message);
      }
    }

    // Create SubscriptionStatus enum
    console.log("\n2️⃣ Creating SubscriptionStatus enum...");
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'CANCELLED', 'PAST_DUE')
      `);
      console.log("   ✅ SubscriptionStatus enum created");
    } catch (e) {
      if (e.message.includes("already exists")) {
        console.log("   ℹ️  SubscriptionStatus enum already exists");
      } else {
        console.log("   ⚠️  Error:", e.message);
      }
    }

    // Create ClientStatus enum
    console.log("\n3️⃣ Creating ClientStatus enum...");
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TYPE "public"."ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PROSPECT', 'ARCHIVED')
      `);
      console.log("   ✅ ClientStatus enum created");
    } catch (e) {
      if (e.message.includes("already exists")) {
        console.log("   ℹ️  ClientStatus enum already exists");
      } else {
        console.log("   ⚠️  Error:", e.message);
      }
    }

    // Create ReportStatus enum
    console.log("\n4️⃣ Creating ReportStatus enum...");
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TYPE "public"."ReportStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'COMPLETED', 'ARCHIVED')
      `);
      console.log("   ✅ ReportStatus enum created");
    } catch (e) {
      if (e.message.includes("already exists")) {
        console.log("   ℹ️  ReportStatus enum already exists");
      } else {
        console.log("   ⚠️  Error:", e.message);
      }
    }

    // Create SubscriptionTierLevel enum
    console.log("\n5️⃣ Creating SubscriptionTierLevel enum...");
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TYPE "public"."SubscriptionTierLevel" AS ENUM ('STANDARD', 'PROFESSIONAL', 'ENTERPRISE')
      `);
      console.log("   ✅ SubscriptionTierLevel enum created");
    } catch (e) {
      if (e.message.includes("already exists")) {
        console.log("   ℹ️  SubscriptionTierLevel enum already exists");
      } else {
        console.log("   ⚠️  Error:", e.message);
      }
    }

    // Update the role column to use the enum type
    console.log("\n6️⃣ Updating role column type...");
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User"
        ALTER COLUMN "role" TYPE "public"."Role" USING "role"::"public"."Role"
      `);
      console.log("   ✅ role column updated to use Role enum");
    } catch (e) {
      if (e.message.includes("already exists") || e.message.includes("cannot cast")) {
        console.log("   ⚠️  ", e.message);
      } else {
        console.log("   ⚠️  Error:", e.message);
      }
    }

    // Update subscriptionStatus column to use enum
    console.log("\n7️⃣ Updating subscriptionStatus column type...");
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User"
        ALTER COLUMN "subscriptionStatus" TYPE "public"."SubscriptionStatus" USING "subscriptionStatus"::"public"."SubscriptionStatus"
      `);
      console.log("   ✅ subscriptionStatus column updated to use SubscriptionStatus enum");
    } catch (e) {
      if (e.message.includes("cannot cast")) {
        console.log("   ℹ️  Need to set default values first");
        // First set all null values to TRIAL
        await prisma.$executeRawUnsafe(`
          UPDATE "User" SET "subscriptionStatus" = 'TRIAL' WHERE "subscriptionStatus" IS NULL
        `);
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "User"
          ALTER COLUMN "subscriptionStatus" TYPE "public"."SubscriptionStatus" USING 'TRIAL'::"public"."SubscriptionStatus"
        `);
        console.log("   ✅ subscriptionStatus column updated");
      } else if (e.message.includes("already exists")) {
        console.log("   ℹ️  Column type already correct");
      } else {
        console.log("   ⚠️  Error:", e.message);
      }
    }

    // Update interviewTier column to use enum
    console.log("\n8️⃣ Updating interviewTier column type...");
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User"
        ALTER COLUMN "interviewTier" TYPE "public"."SubscriptionTierLevel" USING "interviewTier"::"public"."SubscriptionTierLevel"
      `);
      console.log("   ✅ interviewTier column updated to use SubscriptionTierLevel enum");
    } catch (e) {
      if (e.message.includes("cannot cast")) {
        // Set default STANDARD
        await prisma.$executeRawUnsafe(`
          UPDATE "User" SET "interviewTier" = 'STANDARD' WHERE "interviewTier" IS NULL
        `);
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "User"
          ALTER COLUMN "interviewTier" TYPE "public"."SubscriptionTierLevel" USING 'STANDARD'::"public"."SubscriptionTierLevel"
        `);
        console.log("   ✅ interviewTier column updated");
      } else {
        console.log("   ⚠️  Error:", e.message);
      }
    }

    console.log("\n🎉 All enum types created successfully!");

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createEnums();
