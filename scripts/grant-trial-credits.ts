/**
 * One-time script: Grant existing TRIAL users 30 report credits and 30 quick fill credits
 * (same as new signups after the trial-credits change).
 *
 * Run from project root:
 *   npx tsx scripts/grant-trial-credits.ts
 *
 * Or: npm run script:grant-trial-credits
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const REPORT_CREDITS = 30
const QUICK_FILL_CREDITS = 30

async function main() {
  // Update all users on TRIAL to have 30 report credits and 30 quick fill credits
  const result = await prisma.user.updateMany({
    where: { subscriptionStatus: 'TRIAL' },
    data: {
      creditsRemaining: REPORT_CREDITS,
      quickFillCreditsRemaining: QUICK_FILL_CREDITS,
    },
  })

  console.log(
    `Updated ${result.count} trial user(s) to ${REPORT_CREDITS} report credits and ${QUICK_FILL_CREDITS} quick fill credits.`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
