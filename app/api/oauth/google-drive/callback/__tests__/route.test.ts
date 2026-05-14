/**
 * Tests for GET /api/oauth/google-drive/callback
 *
 * Cases:
 *  - Missing code → redirect to /setup?error=missing-code-or-state
 *  - Replayed/invalid state → redirect to /setup?error=invalid-state
 *  - Provider error param → redirect to /setup?error=<err>
 *  - Happy path → Organization row updated with encrypted tokens +
 *    storageProvider=GOOGLE_DRIVE; refresh token round-trips through decrypt;
 *    storageProviderPkceVerifier cleared.
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
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/credential-vault";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockExchange = vi.fn();
const mockFetchEmail = vi.fn();
vi.mock("@/lib/storage/google-drive-oauth", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/storage/google-drive-oauth")
  >("@/lib/storage/google-drive-oauth");
  return {
    ...actual,
    exchangeCodeForTokens: (...args: unknown[]) => mockExchange(...args),
    fetchGoogleUserEmail: (...args: unknown[]) => mockFetchEmail(...args),
  };
});

process.env.GOOGLE_DRIVE_CLIENT_ID = "test-drive-client";
process.env.GOOGLE_DRIVE_CLIENT_SECRET = "test-drive-secret";
process.env.NEXTAUTH_URL = "http://localhost:3000";
// credential-vault requires an encryption key
process.env.CREDENTIAL_ENCRYPTION_KEY ||=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const { GET } = await import("../route");

function makeReq(qs: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/oauth/google-drive/callback");
  for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

describe("GET /api/oauth/google-drive/callback", () => {
  let testUserId = "";
  let testOrgId = "";

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `oauth-cb-${Date.now()}@test.com` },
    });
    testUserId = u.id;
    const o = await prisma.organization.create({
      data: {
        name: "OAuth Callback Test Co",
        ownerId: u.id,
        storageProviderPkceVerifier: "test-verifier",
      },
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
    mockExchange.mockReset();
    mockFetchEmail.mockReset();
  });

  it("redirects to /setup?error=missing-code-or-state when code missing", async () => {
    const res = await GET(makeReq({ state: "abc" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain(
      "/setup?error=missing-code-or-state",
    );
  });

  it("forwards provider error param", async () => {
    const res = await GET(makeReq({ error: "access_denied" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/setup?error=access_denied");
  });

  it("redirects to /setup?error=invalid-state when nonce invalid", async () => {
    const res = await GET(makeReq({ code: "c", state: "not-a-real-nonce" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/setup?error=invalid-state");
  });

  it("happy path: persists encrypted tokens + storageProvider=GOOGLE_DRIVE", async () => {
    const nonce = crypto.randomBytes(32).toString("hex");
    await prisma.oAuthStateNonce.create({
      data: {
        nonce,
        userId: testUserId,
        provider: "GOOGLE_DRIVE",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    // Reset verifier (may have been cleared by an earlier callback test)
    await prisma.organization.update({
      where: { id: testOrgId },
      data: { storageProviderPkceVerifier: "test-verifier" },
    });

    mockExchange.mockResolvedValue({
      accessToken: "access-token-xyz",
      refreshToken: "refresh-token-abc",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    mockFetchEmail.mockResolvedValue("user@example.com");

    const res = await GET(makeReq({ code: "auth-code", state: nonce }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/setup?storage=connected");

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: testOrgId },
    });
    expect(org.storageProvider).toBe("GOOGLE_DRIVE");
    expect(org.storageProviderAccountEmail).toBe("user@example.com");
    expect(org.storageProviderPkceVerifier).toBeNull();
    expect(org.storageProviderRefreshToken).toBeTruthy();
    expect(org.storageProviderAccessToken).toBeTruthy();
    expect(decrypt(org.storageProviderRefreshToken!)).toBe("refresh-token-abc");
    expect(decrypt(org.storageProviderAccessToken!)).toBe("access-token-xyz");
  });

  it("rejects replayed nonce on second use", async () => {
    const nonce = crypto.randomBytes(32).toString("hex");
    await prisma.oAuthStateNonce.create({
      data: {
        nonce,
        userId: testUserId,
        provider: "GOOGLE_DRIVE",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.organization.update({
      where: { id: testOrgId },
      data: { storageProviderPkceVerifier: "test-verifier" },
    });
    mockExchange.mockResolvedValue({
      accessToken: "a",
      refreshToken: "r",
      expiresAt: null,
    });
    mockFetchEmail.mockResolvedValue("user@example.com");

    const ok = await GET(makeReq({ code: "c", state: nonce }));
    expect(ok.headers.get("location")).toContain("/setup?storage=connected");

    const replay = await GET(makeReq({ code: "c", state: nonce }));
    expect(replay.headers.get("location")).toContain(
      "/setup?error=invalid-state",
    );
  });
});
