import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));
import { getServerSession } from 'next-auth';

describe.skipIf(!process.env.DATABASE_URL)('GET /api/setup/hydrate/stream', () => {
  let testUserId = '';
  let testOrgId = '';

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `sse-${Date.now()}@test.com` } });
    testUserId = u.id;
    const o = await prisma.organization.create({ data: { name: 'SSE Test Co', ownerId: u.id } });
    testOrgId = o.id;
    await prisma.user.update({ where: { id: u.id }, data: { organizationId: o.id } });

    // Seed 3 terminal jobs so the stream closes immediately
    await prisma.hydrationJob.createMany({
      data: [
        { organizationId: testOrgId, kind: 'ABR',     status: 'READY' },
        { organizationId: testOrgId, kind: 'WEBSITE', status: 'MANUAL' },
        { organizationId: testOrgId, kind: 'PRICING', status: 'READY' },
      ],
    });
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

  it('returns 200 with text/event-stream content type when authed', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toContain('no-cache');
  });

  it('emits at least one SSE frame containing the seeded job statuses', async () => {
    const res = await GET();
    expect(res.body).not.toBeNull();
    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let frames = 0;
    // Read up to 5 chunks or until stream ends
    for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value);
      // SSE frames are separated by \n\n
      const newFrames = (buffer.match(/\n\n/g) || []).length;
      if (newFrames > frames) frames = newFrames;
      if (frames >= 1) break;
    }
    expect(frames).toBeGreaterThanOrEqual(1);
    expect(buffer).toContain('data: ');
    // The seeded payload must include READY status for ABR + PRICING
    expect(buffer).toContain('"READY"');
  });
});
