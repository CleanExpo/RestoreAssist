const { PrismaClient } = require("@prisma/client");

async function fixDefaults() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"
      }
    }
  });

  try {
    console.log("🔧 Fixing column defaults and types...\n");

    // Fix role column
    console.log("1️⃣ Fixing role column...");
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "role" TYPE "public"."Role" USING 'USER'::"public"."Role"`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER'::"public"."Role"`);
      console.log("   ✅ role column fixed");
    } catch (e) {
      console.log("   ⚠️ ", e.message.split('\n')[0]);
    }

    // Fix subscriptionStatus column
    console.log("\n2️⃣ Fixing subscriptionStatus column...");
    try {
      await prisma.$executeRawUnsafe(`UPDATE "User" SET "subscriptionStatus" = 'TRIAL' WHERE "subscriptionStatus" IS NULL OR "subscriptionStatus" = ''`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "subscriptionStatus" DROP DEFAULT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "subscriptionStatus" TYPE "public"."SubscriptionStatus" USING 'TRIAL'::"public"."SubscriptionStatus"`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "subscriptionStatus" SET DEFAULT 'TRIAL'::"public"."SubscriptionStatus"`);
      console.log("   ✅ subscriptionStatus column fixed");
    } catch (e) {
      console.log("   ⚠️ ", e.message.split('\n')[0]);
    }

    // Fix interviewTier column
    console.log("\n3️⃣ Fixing interviewTier column...");
    try {
      await prisma.$executeRawUnsafe(`UPDATE "User" SET "interviewTier" = 'STANDARD' WHERE "interviewTier" IS NULL OR "interviewTier" = ''`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "interviewTier" DROP DEFAULT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "interviewTier" TYPE "public"."SubscriptionTierLevel" USING 'STANDARD'::"public"."SubscriptionTierLevel"`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "interviewTier" SET DEFAULT 'STANDARD'::"public"."SubscriptionTierLevel"`);
      console.log("   ✅ interviewTier column fixed");
    } catch (e) {
      console.log("   ⚠️ ", e.message.split('\n')[0]);
    }

    console.log("\n🎉 All column defaults and types fixed!");

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixDefaults();
