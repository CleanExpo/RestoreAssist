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
});
