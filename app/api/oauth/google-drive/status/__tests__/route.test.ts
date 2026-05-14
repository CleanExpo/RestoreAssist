/**
 * Tests for GET /api/oauth/google-drive/status
 *
 * Used by the StorageCard to decide whether to render the "Connect" grid or
 * the "Connected as <email>" success row.
 *
 * Cases:
 *  - unauth → 401
 *  - authed, no org → { connected: false, provider: null, accountEmail: null }
 *  - authed, org with GOOGLE_DRIVE → { connected: true, provider: 'GOOGLE_DRIVE', accountEmail }
 *  - authed, org with SUPABASE → { connected: false, provider: 'SUPABASE', accountEmail: null }
 */

import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { prisma } from "@/lib/prisma";

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: () => mockGetServerSession(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const { GET } = await import("../route");

describe("GET /api/oauth/google-drive/status", () => {
  let testUserId = "";
  let testOrgId = "";

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `oauth-status-${Date.now()}@test.com` },
    });
    testUserId = u.id;
    const o = await prisma.organization.create({
      data: { name: "Status Test Co", ownerId: u.id },
    });
    testOrgId = o.id;
  });

  afterAll(async () => {
    await prisma.organization
      .delete({ where: { id: testOrgId } })
      .catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mockGetServerSession.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns disconnected when user has no Organization", async () => {
    const u = await prisma.user.create({
      data: { email: `status-no-org-${Date.now()}@test.com` },
    });
    mockGetServerSession.mockResolvedValue({ user: { id: u.id } });
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({
      connected: false,
      provider: null,
      accountEmail: null,
    });
    await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  });

  it("returns connected=true when storageProvider=GOOGLE_DRIVE", async () => {
    await prisma.organization.update({
      where: { id: testOrgId },
      data: {
        storageProvider: "GOOGLE_DRIVE",
        storageProviderAccountEmail: "test@example.com",
      },
    });
    mockGetServerSession.mockResolvedValue({ user: { id: testUserId } });
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({
      connected: true,
      provider: "GOOGLE_DRIVE",
      accountEmail: "test@example.com",
    });
  });

  it("returns connected=false when storageProvider=SUPABASE", async () => {
    await prisma.organization.update({
      where: { id: testOrgId },
      data: { storageProvider: "SUPABASE", storageProviderAccountEmail: null },
    });
    mockGetServerSession.mockResolvedValue({ user: { id: testUserId } });
    const res = await GET();
    const body = await res.json();
    expect(body.connected).toBe(false);
    expect(body.provider).toBe("SUPABASE");
    expect(body.accountEmail).toBeNull();
  });
});
