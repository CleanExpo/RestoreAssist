/**
 * RA-8078 — the OneDrive OAuth start route must refuse while OneDrive is not
 * offered in PROVIDER_CATALOG. Otherwise a direct link still completes a
 * Microsoft login and lands the user on a "connected" page for a mirror that
 * never copies a file.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: () => mockGetServerSession(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const nonceCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { oAuthStateNonce: { create: (...a: unknown[]) => nonceCreate(...a) } },
}));

const { GET } = await import("../route");

describe("GET /api/oauth/microsoft-onedrive/start", () => {
  const original = process.env.MICROSOFT_CLIENT_ID;

  afterEach(() => {
    if (original === undefined) delete process.env.MICROSOFT_CLIENT_ID;
    else process.env.MICROSOFT_CLIENT_ID = original;
    mockGetServerSession.mockReset();
    nonceCreate.mockReset();
  });

  it("does not start Microsoft OAuth while OneDrive is not offered, even with MICROSOFT_CLIENT_ID set", async () => {
    process.env.MICROSOFT_CLIENT_ID = "test-client-id";
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });

    const res = await GET(
      new Request("http://localhost/api/oauth/microsoft-onedrive/start") as never,
    );

    const location = res.headers.get("location") ?? "";
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(location).not.toMatch(/login\.microsoftonline\.com/);
    expect(location).toMatch(/\/dashboard\/settings\/cloud-mirror\?error=onedrive-not-available/);
    expect(nonceCreate).not.toHaveBeenCalled();
  });

  it("still returns 401 without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/oauth/microsoft-onedrive/start") as never,
    );
    expect(res.status).toBe(401);
  });
});
