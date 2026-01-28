import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@local.dev';

  // Use raw SQL to update subscription fields
  await prisma.$executeRaw`
    UPDATE "User"
    SET
      "subscriptionStatus" = 'ACTIVE',
      "subscriptionPlan" = 'monthly',
      "creditsRemaining" = 50,
      "monthlyReportsUsed" = 0,
      "monthlyResetDate" = NOW() + INTERVAL '30 days'
    WHERE email = ${email}
  `;

  console.log('✅ User subscription updated!');
  console.log('📧 Email:', email);
  console.log('✨ Subscription: ACTIVE (Monthly - 50 reports)');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
