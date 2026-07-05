import { prisma } from '@/lib/prisma';

/**
 * Idempotent backfill from User.business* + CompanyPricingConfig
 * to the new Organization fields + OrganizationPricingConfig added in
 * Migration A (2026-05-12).
 *
 * Safe to run any number of times. Only writes a field if the
 * Organization's current value is null (no clobber).
 * CompanyPricingConfig rows are read but NOT deleted — Migration B will
 * handle cleanup once the old model is retired.
 */
export async function backfill(): Promise<{
  usersTouched: number;
  orgsUpdated: number;
  pricingMoved: number;
}> {
  const PAGE_LIMIT = 10_000;
  const users = await prisma.user.findMany({
    select: {
      id: true,
      organizationId: true,
      businessName: true,
      businessABN: true,
      businessACN: true,
      businessState: true,
      businessAddress: true,
      businessPhone: true,
      businessEmail: true,
      businessLogo: true,
    },
    take: PAGE_LIMIT,
  });

  if (users.length === PAGE_LIMIT) {
    console.warn(`[backfill] WARNING: fetched ${PAGE_LIMIT} users (the limit). If you have more than ${PAGE_LIMIT} users in this database, results are truncated and a paginated re-run is required.`);
  }

  let orgsUpdated = 0;
  let pricingMoved = 0;
  let usersTouched = 0;

  for (const u of users) {
    if (!u.organizationId) continue;
    usersTouched++;

    const org = await prisma.organization.findUnique({
      where: { id: u.organizationId },
      select: {
        id: true,
        legalName: true,
        abn: true,
        acn: true,
        state: true,
        address: true,
        phone: true,
        email: true,
        logoUrl: true,
      },
    });
    if (!org) continue;

    const patch: Record<string, string> = {};
    if (!org.legalName && u.businessName)     patch.legalName = u.businessName;
    if (!org.abn && u.businessABN)            patch.abn = u.businessABN;
    if (!org.acn && u.businessACN)            patch.acn = u.businessACN;
    if (!org.state && u.businessState)        patch.state = u.businessState;
    if (!org.address && u.businessAddress)    patch.address = u.businessAddress;
    if (!org.phone && u.businessPhone)        patch.phone = u.businessPhone;
    if (!org.email && u.businessEmail)        patch.email = u.businessEmail;
    if (!org.logoUrl && u.businessLogo)       patch.logoUrl = u.businessLogo;

    if (Object.keys(patch).length > 0) {
      await prisma.organization.update({ where: { id: org.id }, data: patch });
      orgsUpdated++;
    }

    // Move CompanyPricingConfig → OrganizationPricingConfig (per-user → per-org)
    const cpc = await prisma.companyPricingConfig.findFirst({ where: { userId: u.id } });
    if (cpc) {
      const existing = await prisma.organizationPricingConfig.findUnique({
        where: { organizationId: org.id },
      });
      if (!existing) {
        // Strip meta fields that belong to the source row, not the destination
        const {
          id: _id,
          userId: _userId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          // CompanyPricingConfig-only field (RA-6996); OrganizationPricingConfig
          // has no such column, so exclude it from the migrated spread.
          electricityRatePer24h: _electricityRatePer24h,
          ...rest
        } = cpc;
        await prisma.organizationPricingConfig.create({
          data: { ...rest, organizationId: org.id },
        });
        pricingMoved++;
      }
    }
  }

  return { usersTouched, orgsUpdated, pricingMoved };
}

// CLI entry point — ESM-compatible main check
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  new URL(import.meta.url).pathname === process.argv[1];

if (isMain) {
  backfill()
    .then((r) => {
      console.log(`Backfill complete: ${JSON.stringify(r)}`);
      return prisma.$disconnect();
    })
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
