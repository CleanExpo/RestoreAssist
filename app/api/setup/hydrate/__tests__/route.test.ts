/**
 * Tests for POST /api/setup/hydrate
 * Route: app/api/setup/hydrate/route.ts
 *
 * Mocks job runners so tests stay offline + fast.
 * Tests the route contract only — job internals tested separately.
 */

import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRunAbrJob = vi.fn().mockResolvedValue(undefined);
const mockRunWebsiteJob = vi.fn().mockResolvedValue(undefined);
const mockRunPricingJob = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/setup/jobs', () => ({
  runAbrJob: (...args: unknown[]) => mockRunAbrJob(...args),
  runWebsiteJob: (...args: unknown[]) => mockRunWebsiteJob(...args),
  runPricingJob: (...args: unknown[]) => mockRunPricingJob(...args),
}));

const mockGetServerSession = vi.fn();
vi.mock('next-auth', () => ({
  getServerSession: () => mockGetServerSession(),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

// ── Import route AFTER mocks are set up ───────────────────────────────────────
const { POST } = await import('../route');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/setup/hydrate', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

describe.skipIf(!process.env.DATABASE_URL)('POST /api/setup/hydrate', () => {
  let testUserId = '';
  let testOrgId = '';

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `hydrate-${Date.now()}@test.com` } });
    testUserId = u.id;
    const o = await prisma.organization.create({ data: { name: 'Hydrate Test Co', ownerId: u.id } });
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
    mockRunAbrJob.mockClear();
    mockRunWebsiteJob.mockClear();
    mockRunPricingJob.mockClear();
    mockGetServerSession.mockResolvedValue({ user: { id: testUserId, email: 'hydrate-test@test.com' } });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────────

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeReq({ abn: '53004085616' }));
    expect(res.status).toBe(401);
  });

  // ── Validation ────────────────────────────────────────────────────────────────

  it('returns 400 on invalid JSON body', async () => {
    const req = new NextRequest('http://test/api/setup/hydrate', {
      method: 'POST',
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid ABN', async () => {
    const res = await POST(makeReq({ abn: '123' }));
    expect(res.status).toBe(400);
  });

  // ── Success ───────────────────────────────────────────────────────────────────

  it('creates 3 HydrationJob rows + sets setupStartedAt on valid ABN', async () => {
    // Clean up any jobs from prior test runs
    await prisma.hydrationJob.deleteMany({ where: { organizationId: testOrgId } });

    const res = await POST(makeReq({ abn: '53004085616', website: 'https://example.com' }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.data.accepted).toBe(true);

    const jobs = await prisma.hydrationJob.findMany({ where: { organizationId: testOrgId } });
    expect(jobs).toHaveLength(3);
    for (const j of jobs) {
      expect(j.status).toBe('RUNNING');
    }

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: testOrgId } });
    expect(org.abn).toBe('53004085616');
    expect(org.setupStartedAt).not.toBeNull();
  });

  it('on re-submit, upserts (does not duplicate) the 3 jobs', async () => {
    await POST(makeReq({ abn: '53004085616' }));  // second call on top of prior test
    const jobs = await prisma.hydrationJob.findMany({ where: { organizationId: testOrgId } });
    expect(jobs).toHaveLength(3);  // still 3, not 6
  });

  it('marks WEBSITE job as MANUAL when no website provided', async () => {
    // Clean prior state from earlier tests
    await prisma.hydrationJob.deleteMany({ where: { organizationId: testOrgId } });

    const req = new Request('http://test/api/setup/hydrate', {
      method: 'POST',
      body: JSON.stringify({ abn: '53004085616' }),  // no website
    });
    const res = await POST(req);
    expect(res.status).toBe(202);

    const jobs = await prisma.hydrationJob.findMany({ where: { organizationId: testOrgId } });
    expect(jobs).toHaveLength(3);
    const website = jobs.find((j) => j.kind === 'WEBSITE');
    expect(website?.status).toBe('MANUAL');
    expect(website?.completedAt).not.toBeNull();
    const abr = jobs.find((j) => j.kind === 'ABR');
    expect(abr?.status).toBe('RUNNING');
  });

  // Prelaunch audit J-03: an ABN another business already holds gave a bare 500
  // ("Request failed") and left the jobs RUNNING, so the business step spun.
  it('returns 409 with a readable message, and starts nothing, when another business holds the ABN', async () => {
    // The first business holds the ABN.
    await prisma.organization.update({ where: { id: testOrgId }, data: { abn: '53004085616' } });
    const second = await prisma.user.create({ data: { email: `hydrate-2-${Date.now()}@test.com` } });
    const secondOrg = await prisma.organization.create({
      data: { name: 'Second Hydrate Co', ownerId: second.id },
    });
    try {
      mockGetServerSession.mockResolvedValue({ user: { id: second.id, email: 'second@test.com' } });
      const res = await POST(makeReq({ abn: '53 004 085 616', website: 'https://example.com' }));
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error).toMatch(/already registered to another RestoreAssist account/);
      expect(await prisma.hydrationJob.count({ where: { organizationId: secondOrg.id } })).toBe(0);
      const org = await prisma.organization.findUniqueOrThrow({ where: { id: secondOrg.id } });
      expect(org.abn).toBeNull();
      expect(org.setupStartedAt).toBeNull();
      expect(mockRunAbrJob).not.toHaveBeenCalled();
      expect(mockRunPricingJob).not.toHaveBeenCalled();
    } finally {
      await prisma.hydrationJob.deleteMany({ where: { organizationId: secondOrg.id } });
      await prisma.organization.delete({ where: { id: secondOrg.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: second.id } }).catch(() => {});
    }
  });
});
