/**
 * One-time script for existing TRIAL users:
 * 1. Extend trial to 30 days from signup (trialEndsAt = createdAt + 30 days)
 *    so everyone gets the full 30-day unlimited trial.
 *
 * Run from project root:
 *   npx tsx scripts/grant-trial-credits.ts
 *
 * Or: npm run script:grant-trial-credits
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TRIAL_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

async function main() {
  const trialUsers = await prisma.user.findMany({
    where: { subscriptionStatus: 'TRIAL' },
    select: { id: true, createdAt: true, trialEndsAt: true },
  })

  let extended = 0
  for (const u of trialUsers) {
    const signupEnd = new Date(u.createdAt.getTime() + TRIAL_DAYS * MS_PER_DAY)
    const currentEnd = u.trialEndsAt ? new Date(u.trialEndsAt) : null
    const newEnd = currentEnd == null || signupEnd > currentEnd ? signupEnd : currentEnd

    await prisma.user.update({
      where: { id: u.id },
      data: { trialEndsAt: newEnd },
    })
    extended++
  }

  console.log(
    `Extended ${extended} trial user(s) to ${TRIAL_DAYS} days from signup. Trial = unlimited reports and quick fill during period.`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
