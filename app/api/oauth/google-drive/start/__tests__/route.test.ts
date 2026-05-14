/**
 * Tests for GET /api/oauth/google-drive/start
 *
 * Three cases:
 *  (a) unauth → 401
 *  (b) authed-but-no-org → 302 to /setup?error=no-org
 *  (c) authed + org → 302 to Google's auth URL, with state + code_challenge,
 *      and Organization.storageProviderPkceVerifier set.
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

// ── Mocks (declared before the route import) ─────────────────────────────────
const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: () => mockGetServerSession(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

// Ensure deterministic env for tests
process.env.GOOGLE_DRIVE_CLIENT_ID = "test-drive-client";
process.env.NEXTAUTH_URL = "http://localhost:3000";

// Import route AFTER mocks set up
const { GET } = await import("../route");

function makeReq() {
  return new Request("http://localhost:3000/api/oauth/google-drive/start");
}

describe("GET /api/oauth/google-drive/start", () => {
  let testUserId = "";
  let testOrgId = "";

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `oauth-start-${Date.now()}@test.com` },
    });
    testUserId = u.id;
    const o = await prisma.organization.create({
      data: { name: "OAuth Start Test Co", ownerId: u.id },
    });
    testOrgId = o.id;
  });

  afterAll(async () => {
    await prisma.oAuthStateNonce
      .deleteMany({ where: { userId: testUserId } })
      .catch(() => {});
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
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("redirects to /setup?error=no-org when user has no Organization", async () => {
    const u = await prisma.user.create({
      data: { email: `no-org-${Date.now()}@test.com` },
    });
    mockGetServerSession.mockResolvedValue({ user: { id: u.id } });
    const res = await GET(makeReq());
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/setup?error=no-org");
    await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  });

  it("redirects to Google auth URL with state + PKCE challenge", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: testUserId } });
    const res = await GET(makeReq());
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    const params = new URL(loc).searchParams;
    expect(params.get("state")).toBeTruthy();
    expect(params.get("code_challenge")).toBeTruthy();
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("client_id")).toBe("test-drive-client");

    // Verifier persisted
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: testOrgId },
    });
    expect(org.storageProviderPkceVerifier).toBeTruthy();
  });
});
