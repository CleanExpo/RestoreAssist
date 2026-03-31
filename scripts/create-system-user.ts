/**
 * Create System User for Content Pipeline Automation
 *
 * Usage:
 *   npx ts-node scripts/create-system-user.ts
 *
 * Creates (or finds) an ADMIN-role user with email `system@restoreassist.app`
 * used by cron jobs to own ContentJobs. Prints the user ID to stdout.
 *
 * Set the output as CONTENT_SYSTEM_USER_ID in your environment variables.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SYSTEM_EMAIL = 'system@restoreassist.app'
const SYSTEM_NAME = 'RestoreAssist System'

async function main() {
  // Check if system user already exists
  const existing = await prisma.user.findUnique({
    where: { email: SYSTEM_EMAIL },
    select: { id: true, email: true, role: true },
  })

  if (existing) {
    console.log(`System user already exists:`)
    console.log(`  ID:    ${existing.id}`)
    console.log(`  Email: ${existing.email}`)
    console.log(`  Role:  ${existing.role}`)
    console.log(`\nSet CONTENT_SYSTEM_USER_ID=${existing.id}`)
    return
  }

  // Create new system user
  const user = await prisma.user.create({
    data: {
      email: SYSTEM_EMAIL,
      name: SYSTEM_NAME,
      role: 'ADMIN',
      subscriptionStatus: 'ACTIVE', // Bypass subscription checks for automation
      creditsRemaining: 999999,
      totalCreditsUsed: 0,
      quickFillCreditsRemaining: 999999,
      totalQuickFillUsed: 0,
    },
    select: { id: true, email: true, role: true },
  })

  console.log(`System user created:`)
  console.log(`  ID:    ${user.id}`)
  console.log(`  Email: ${user.email}`)
  console.log(`  Role:  ${user.role}`)
  console.log(`\nSet CONTENT_SYSTEM_USER_ID=${user.id}`)
}

main()
  .catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
