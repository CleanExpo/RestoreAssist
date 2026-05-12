import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { PATCH } from '../route';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
import { getServerSession } from 'next-auth';

describe('PATCH /api/setup/pricing', () => {
  let testUserId = '';
  let testOrgId = '';

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `pricing-${Date.now()}@test.com` } });
    testUserId = u.id;
    const o = await prisma.organization.create({ data: { name: 'Pricing Test Co', ownerId: u.id } });
    testOrgId = o.id;
    await prisma.user.update({ where: { id: u.id }, data: { organizationId: o.id } });
  });

  afterAll(async () => {
    await prisma.organizationPricingConfig.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.organization.delete({ where: { id: testOrgId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: testUserId, email: 't@t.com' },
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
