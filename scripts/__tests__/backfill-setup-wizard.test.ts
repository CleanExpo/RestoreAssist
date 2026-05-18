import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { backfill } from '../backfill-setup-wizard';
import { prisma } from '@/lib/prisma';

describe.skipIf(!process.env.DATABASE_URL)('backfill', () => {
  beforeEach(async () => {
    // Clean slate — order matters (FKs)
    await prisma.organizationPricingConfig.deleteMany({});
    await prisma.companyPricingConfig.deleteMany({});
    await prisma.user.updateMany({ data: { organizationId: null } });
    await prisma.organization.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('copies User business fields onto owning Organization', async () => {
    const user = await prisma.user.create({
      data: {
        email: `a${Date.now()}@test.com`,
        businessName: 'Acme Pty Ltd',
        businessABN: '53004085616',
        businessState: 'NSW',
      },
    });
    const org = await prisma.organization.create({ data: { name: 'Acme Pty Ltd', ownerId: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { organizationId: org.id } });

    await backfill();

    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(after.abn).toBe('53004085616');
    expect(after.state).toBe('NSW');
    expect(after.legalName).toBe('Acme Pty Ltd');
  });

  it('is idempotent — re-running is a no-op', async () => {
    const user = await prisma.user.create({
      data: {
        email: `b${Date.now()}@test.com`,
        businessName: 'X',
        businessABN: '11111111111',
      },
    });
    const org = await prisma.organization.create({ data: { name: 'X', ownerId: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { organizationId: org.id } });

    await backfill();
    await backfill();

    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(after.abn).toBe('11111111111');
    expect(after.legalName).toBe('X');
  });

  it('moves CompanyPricingConfig data to OrganizationPricingConfig', async () => {
    const user = await prisma.user.create({
      data: { email: `c${Date.now()}@test.com` },
    });
    const org = await prisma.organization.create({ data: { name: 'Y', ownerId: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { organizationId: org.id } });

    await prisma.companyPricingConfig.create({
      data: {
        userId: user.id,
        masterQualifiedNormalHours: 200,
        masterQualifiedSaturday: 0,
        masterQualifiedSunday: 0,
        qualifiedTechnicianNormalHours: 0,
        qualifiedTechnicianSaturday: 0,
        qualifiedTechnicianSunday: 0,
        labourerNormalHours: 0,
        labourerSaturday: 0,
        labourerSunday: 0,
        airMoverAxialDailyRate: 0,
        airMoverCentrifugalDailyRate: 0,
        dehumidifierLGRDailyRate: 0,
        dehumidifierDesiccantDailyRate: 0,
        afdUnitLargeDailyRate: 0,
        extractionTruckMountedHourlyRate: 0,
        extractionElectricHourlyRate: 0,
        injectionDryingSystemDailyRate: 0,
        antimicrobialTreatmentRate: 0,
        mouldRemediationTreatmentRate: 0,
        biohazardTreatmentRate: 0,
        administrationFee: 0,
        callOutFee: 0,
        thermalCameraUseCostPerAssessment: 0,
      },
    });

    await backfill();

    const opc = await prisma.organizationPricingConfig.findUnique({ where: { organizationId: org.id } });
    expect(opc).not.toBeNull();
    expect(opc?.masterQualifiedNormalHours).toBe(200);
  });
});
