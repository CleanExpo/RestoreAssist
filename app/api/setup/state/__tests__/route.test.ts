import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { GET, PATCH } from '../route';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));
import { getServerSession } from 'next-auth';

describe.skipIf(!process.env.DATABASE_URL)('GET /api/setup/state', () => {
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

describe.skipIf(!process.env.DATABASE_URL)('PATCH /api/setup/state', () => {
  let testUserId = '';
  let testOrgId = '';

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `patch-state-${Date.now()}@test.com` } });
    testUserId = u.id;
    const o = await prisma.organization.create({
      data: {
        name: 'Patch Test Co',
        ownerId: u.id,
        legalName: 'Patch Test Pty Ltd',
        abn: '53004085616',
        state: 'VIC',
      },
    });
    testOrgId = o.id;
    await prisma.user.update({ where: { id: u.id }, data: { organizationId: o.id } });
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: testOrgId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    (getServerSession as any).mockResolvedValue({ user: { id: testUserId, email: 't@t.com' } });
  });

  it('returns 401 when unauthenticated', async () => {
    (getServerSession as any).mockResolvedValue(null);
    const req = new Request('http://localhost/api/setup/state', {
      method: 'PATCH',
      body: JSON.stringify({ primaryColor: '#ff0000' }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when body contains no patchable fields', async () => {
    const req = new Request('http://localhost/api/setup/state', {
      method: 'PATCH',
      body: JSON.stringify({ unknownField: 'value' }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/no patchable fields/i);
  });

  it('patches a single field and returns 200 with updated list', async () => {
    const req = new Request('http://localhost/api/setup/state', {
      method: 'PATCH',
      body: JSON.stringify({ primaryColor: '#aabbcc' }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.updated).toContain('primaryColor');
    const updated = await prisma.organization.findUnique({ where: { id: testOrgId }, select: { primaryColor: true } });
    expect(updated?.primaryColor).toBe('#aabbcc');
  });

  it('returns 409 when setup is already completed', async () => {
    await prisma.organization.update({
      where: { id: testOrgId },
      data: { setupCompletedAt: new Date() },
    });
    const req = new Request('http://localhost/api/setup/state', {
      method: 'PATCH',
      body: JSON.stringify({ primaryColor: '#000000' }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(409);
    // Restore for any subsequent tests
    await prisma.organization.update({ where: { id: testOrgId }, data: { setupCompletedAt: null } });
  });
});
