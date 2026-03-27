/**
 * Data Migration: Create default BusinessProfile records from existing User business fields,
 * then associate existing Clients, Reports, Inspections, and Invoices with the default profile.
 *
 * This script is idempotent — it skips users who already have a default BusinessProfile,
 * and only updates records that have no businessProfileId yet.
 *
 * Usage:
 *   npx tsx scripts/migrate-business-profiles.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting BusinessProfile migration...')

  // --- Phase 1: Create default profiles from User business fields ---

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { businessName: { not: null } },
        { businessABN: { not: null } },
        { businessLogo: { not: null } },
        { businessAddress: { not: null } },
        { businessPhone: { not: null } },
        { businessEmail: { not: null } },
      ],
      businessProfiles: {
        none: { isDefault: true },
      },
    },
    select: {
      id: true,
      businessName: true,
      businessABN: true,
      businessLogo: true,
      businessAddress: true,
      businessPhone: true,
      businessEmail: true,
    },
  })

  console.log(`Phase 1: Found ${users.length} users to create default profiles for.`)

  let profilesCreated = 0
  let profilesSkipped = 0

  for (const user of users) {
    const name = user.businessName?.trim()
    if (!name) {
      profilesSkipped++
      continue
    }

    try {
      const profile = await prisma.businessProfile.create({
        data: {
          userId: user.id,
          name,
          abn: user.businessABN,
          logoUrl: user.businessLogo,
          address: user.businessAddress,
          phone: user.businessPhone,
          email: user.businessEmail,
          isDefault: true,
        },
      })

      await prisma.user.update({
        where: { id: user.id },
        data: { activeBusinessProfileId: profile.id },
      })

      profilesCreated++
    } catch (err) {
      console.error(`Failed to create profile for user ${user.id}:`, err)
    }
  }

  console.log(`Phase 1 complete. Created: ${profilesCreated}, Skipped: ${profilesSkipped}`)

  // --- Phase 2: Associate existing data with default profiles ---

  // Get all users who now have a default profile
  const profiledUsers = await prisma.businessProfile.findMany({
    where: { isDefault: true },
    select: { id: true, userId: true },
  })

  console.log(`Phase 2: Associating data for ${profiledUsers.length} users with default profiles.`)

  for (const { id: profileId, userId } of profiledUsers) {
    try {
      // Associate orphaned Clients
      const clientResult = await prisma.client.updateMany({
        where: { userId, businessProfileId: null },
        data: { businessProfileId: profileId },
      })

      // Associate orphaned Reports
      const reportResult = await prisma.report.updateMany({
        where: { userId, businessProfileId: null },
        data: { businessProfileId: profileId },
      })

      // Associate orphaned Inspections
      const inspectionResult = await prisma.inspection.updateMany({
        where: { userId, businessProfileId: null },
        data: { businessProfileId: profileId },
      })

      // Associate orphaned Invoices
      const invoiceResult = await prisma.invoice.updateMany({
        where: { userId, businessProfileId: null },
        data: { businessProfileId: profileId },
      })

      const total =
        clientResult.count +
        reportResult.count +
        inspectionResult.count +
        invoiceResult.count

      if (total > 0) {
        console.log(
          `  User ${userId}: ${clientResult.count} clients, ${reportResult.count} reports, ` +
            `${inspectionResult.count} inspections, ${invoiceResult.count} invoices`
        )
      }
    } catch (err) {
      console.error(`Failed to associate data for user ${userId}:`, err)
    }
  }

  console.log('Phase 2 complete. Migration finished.')
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
