import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { PATCH } from '../route';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
import { getServerSession } from 'next-auth';

describe.skipIf(!process.env.DATABASE_URL)('PATCH /api/setup/pricing', () => {
  let testUserId = '';
  let testOrgId = '';
  // A persisted USER who still owns an unfinished setup but carries a stale
  // ADMIN JWT. verifyAdminFromDb must deny it from the database role.
  let demotedUserId = '';
  let demotedOrgId = '';

  beforeAll(async () => {
    // The real owner is ADMIN in the database, not only in the mocked JWT:
    // Prisma defaults role to USER, and verifyAdminFromDb re-reads it.
    const u = await prisma.user.create({
      data: { email: `pricing-${Date.now()}@test.com`, role: 'ADMIN' },
    });
    testUserId = u.id;
    const o = await prisma.organization.create({ data: { name: 'Pricing Test Co', ownerId: u.id } });
    testOrgId = o.id;
    await prisma.user.update({ where: { id: u.id }, data: { organizationId: o.id } });

    const d = await prisma.user.create({
      data: { email: `pricing-demoted-${Date.now()}@test.com`, role: 'USER' },
    });
    demotedUserId = d.id;
    const dOrg = await prisma.organization.create({ data: { name: 'Demoted Pricing Co', ownerId: d.id } });
    demotedOrgId = dOrg.id;
    await prisma.user.update({ where: { id: d.id }, data: { organizationId: dOrg.id } });
  });

  afterAll(async () => {
    await prisma.organizationPricingConfig.deleteMany({
      where: { organizationId: { in: [testOrgId, demotedOrgId] } },
    });
    await prisma.organization.delete({ where: { id: testOrgId } }).catch(() => {});
    await prisma.organization.delete({ where: { id: demotedOrgId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.user.delete({ where: { id: demotedUserId } }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: testUserId, email: 't@t.com', role: 'ADMIN' },
    });
    await prisma.organization.update({
      where: { id: testOrgId },
      data: { setupCompletedAt: null },
    });
    await prisma.organizationPricingConfig.deleteMany({ where: { organizationId: testOrgId } });
  });

  const mkReq = (body: Record<string, unknown>) =>
    new Request('http://test/api/setup/pricing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('returns 401 when unauthenticated', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PATCH(mkReq({ administrationFee: 200 }));
    expect(res.status).toBe(401);
  });

  it('returns 403 and writes nothing for a DB USER holding a stale ADMIN JWT', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: demotedUserId, email: 'd@t.com', role: 'ADMIN' },
    });
    const res = await PATCH(mkReq({ administrationFee: 200 }));
    expect(res.status).toBe(403);
    const written = await prisma.organizationPricingConfig.findUnique({
      where: { organizationId: demotedOrgId },
    });
    expect(written).toBeNull();
  });

  it('returns 400 when no patchable fields are present', async () => {
    const res = await PATCH(mkReq({ randomField: 1 }));
    expect(res.status).toBe(400);
  });

  it('creates pricing config on first PATCH if none exists', async () => {
    const res = await PATCH(mkReq({ administrationFee: 200, masterQualifiedNormalHours: 180 }));
    expect(res.status).toBe(200);
    const p = await prisma.organizationPricingConfig.findUniqueOrThrow({
      where: { organizationId: testOrgId },
    });
    expect(p.administrationFee).toBe(200);
    expect(p.masterQualifiedNormalHours).toBe(180);
  });

  it('updates pricing config on subsequent PATCH', async () => {
    await PATCH(mkReq({ administrationFee: 200 }));
    await PATCH(mkReq({ administrationFee: 250 }));
    const p = await prisma.organizationPricingConfig.findUniqueOrThrow({
      where: { organizationId: testOrgId },
    });
    expect(p.administrationFee).toBe(250);
  });

  it('returns 409 when setup is already completed', async () => {
    await prisma.organization.update({
      where: { id: testOrgId },
      data: { setupCompletedAt: new Date() },
    });
    const res = await PATCH(mkReq({ administrationFee: 200 }));
    expect(res.status).toBe(409);
  });
});
