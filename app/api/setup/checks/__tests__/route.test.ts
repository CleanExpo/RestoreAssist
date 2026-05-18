import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));
import { getServerSession } from 'next-auth';

vi.mock('@/lib/ai/model-router', () => ({
  routeBasic: vi.fn(),
}));
import { routeBasic } from '@/lib/ai/model-router';

describe.skipIf(!process.env.DATABASE_URL)('GET /api/setup/checks', () => {
  let testUserId = '';
  let testOrgId = '';

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `checks-route-${Date.now()}@test.com` } });
    testUserId = u.id;
    const o = await prisma.organization.create({ data: { name: 'Checks Route Co', ownerId: u.id } });
    testOrgId = o.id;
    await prisma.user.update({ where: { id: u.id }, data: { organizationId: o.id } });
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: testOrgId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    (getServerSession as any).mockResolvedValue({ user: { id: testUserId, email: 't@t.com' } });
    (routeBasic as any).mockResolvedValue({ text: 'ok', confidence: 1 });
  });

  it('returns 401 when unauthenticated', async () => {
    (getServerSession as any).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 10 capability rows for an authenticated user', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data.checks)).toBe(true);
    expect(json.data.checks).toHaveLength(10);
    for (const c of json.data.checks) {
      expect(['green', 'yellow', 'red']).toContain(c.status);
      expect(typeof c.capability).toBe('string');
      expect(typeof c.label).toBe('string');
    }
  });

  it('returns 404 when user has no organization', async () => {
    // Detach user from org
    await prisma.user.update({ where: { id: testUserId }, data: { organizationId: null } });
    // Delete org so findFirst returns null
    const orgIdBackup = testOrgId;
    await prisma.organization.delete({ where: { id: orgIdBackup } });

    const res = await GET();
    expect(res.status).toBe(404);

    // Re-create the org for afterAll cleanup (and other tests in this suite if they need it)
    const newOrg = await prisma.organization.create({
      data: { id: orgIdBackup, name: 'Checks Route Co', ownerId: testUserId },
    });
    await prisma.user.update({ where: { id: testUserId }, data: { organizationId: newOrg.id } });
  });
});
