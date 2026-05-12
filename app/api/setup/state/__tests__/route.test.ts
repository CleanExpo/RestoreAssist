import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));
import { getServerSession } from 'next-auth';

describe('GET /api/setup/state', () => {
  let testUserId = '';
  let testOrgId = '';

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `state-${Date.now()}@test.com` } });
    testUserId = u.id;
    const o = await prisma.organization.create({
      data: {
        name: 'State Test Co',
        ownerId: u.id,
        legalName: 'State Test Pty Ltd',
        abn: '53004085616',
        state: 'NSW',
      },
    });
    testOrgId = o.id;
    await prisma.user.update({ where: { id: u.id }, data: { organizationId: o.id } });
  });

  afterAll(async () => {
    await prisma.hydrationJob.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.organization.delete({ where: { id: testOrgId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    (getServerSession as any).mockResolvedValue({ user: { id: testUserId, email: 't@t.com' } });
  });

  it('returns 401 when unauthenticated', async () => {
    (getServerSession as any).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns organization snapshot with sections all PENDING when no jobs exist', async () => {
    await prisma.hydrationJob.deleteMany({ where: { organizationId: testOrgId } });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.organization.legalName).toBe('State Test Pty Ltd');
    expect(json.data.organization.abn).toBe('53004085616');
    expect(json.data.sections.businessDetails).toBe('PENDING');
    expect(json.data.sections.branding).toBe('PENDING');
    expect(json.data.sections.pricing).toBe('PENDING');
  });

  it('reflects hydration job statuses in sections payload', async () => {
    await prisma.hydrationJob.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.hydrationJob.createMany({
      data: [
        { organizationId: testOrgId, kind: 'ABR',     status: 'READY' },
        { organizationId: testOrgId, kind: 'WEBSITE', status: 'MANUAL' },
        { organizationId: testOrgId, kind: 'PRICING', status: 'RUNNING' },
      ],
    });
    const res = await GET();
    const json = await res.json();
    expect(json.data.sections.businessDetails).toBe('READY');
    expect(json.data.sections.branding).toBe('MANUAL');
    expect(json.data.sections.pricing).toBe('RUNNING');
  });
});
