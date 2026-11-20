/**
 * RA-8078 — GET /api/user/cloud-mirror must not report a saved provider the
 * catalog has switched off. Users who saved OneDrive while it was offered
 * (MICROSOFT_CLIENT_ID set) still have it stored, but nothing mirrors there.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

// The Microsoft OAuth env is configured, as it was when OneDrive was offered.
const originalClientId = process.env.MICROSOFT_CLIENT_ID;
process.env.MICROSOFT_CLIENT_ID = "test-client-id";

const { getServerSession } = await import("next-auth");
const { prisma } = await import("@/lib/prisma");
const { GET } = await import("../route");

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;

function get(): NextRequest {
  return new NextRequest("http://localhost/api/user/cloud-mirror");
}

afterAll(() => {
  if (originalClientId === undefined) delete process.env.MICROSOFT_CLIENT_ID;
  else process.env.MICROSOFT_CLIENT_ID = originalClientId;
});

describe("GET /api/user/cloud-mirror — saved provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "user_1" } });
  });

  it("a saved provider the catalog has switched off is not reported as current", async () => {
    findUnique.mockResolvedValue({ cloudMirrorProvider: "onedrive" });

    const res = await GET(get());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBeNull();
    expect(
      body.catalog.find((p: { id: string }) => p.id === "onedrive")?.enabled,
    ).toBe(false);
  });

  it("reports an enabled saved provider", async () => {
    findUnique.mockResolvedValue({ cloudMirrorProvider: "drive" });

    const body = await (await GET(get())).json();

    expect(body.provider).toBe("drive");
  });

  it("reports nothing when no provider is saved", async () => {
    findUnique.mockResolvedValue({ cloudMirrorProvider: null });

    const body = await (await GET(get())).json();

    expect(body.provider).toBeNull();
  });
});
