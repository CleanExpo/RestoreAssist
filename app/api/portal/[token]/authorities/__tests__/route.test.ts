import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/portal/lookup-portal-account", () => ({
  lookupPortalAccount: vi.fn(),
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { authorityFormInstance: { findMany: vi.fn() } },
}));

import { lookupPortalAccount } from "@/lib/portal/lookup-portal-account";
import { applyRateLimit } from "@/lib/rate-limiter";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const mLookup = lookupPortalAccount as unknown as ReturnType<typeof vi.fn>;
const mRate = applyRateLimit as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  authorityFormInstance: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mRate.mockResolvedValue(null);
  mLookup.mockResolvedValue({ clientId: "c_1" });
});

const req = () =>
  new NextRequest("http://localhost/api/portal/tok/authorities", {
    method: "GET",
  });
const params = { params: Promise.resolve({ token: "tok" }) };

describe("GET /api/portal/[token]/authorities", () => {
  it("404 on an invalid/expired link", async () => {
    mLookup.mockResolvedValueOnce(null);
    expect((await GET(req(), params)).status).toBe(404);
  });

  it("lists pending client authorities with their sign token, scoped to the token's client", async () => {
    p.authorityFormInstance.findMany.mockResolvedValue([
      {
        id: "afi_1",
        status: "PENDING_SIGNATURES",
        authorityDescription: "Authority to commence work",
        template: { name: "Authority to Commence Work" },
        signatures: [{ signatureRequestToken: "sig_abc" }],
      },
    ]);
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    // scoped to the token's client (not any body-supplied id)
    expect(p.authorityFormInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ report: { clientId: "c_1" } }),
      }),
    );
    const { authorities } = (await res.json()).data;
    expect(authorities).toEqual([
      {
        id: "afi_1",
        name: "Authority to Commence Work",
        description: "Authority to commence work",
        status: "PENDING_SIGNATURES",
        signToken: "sig_abc",
      },
    ]);
  });

  it("drops instances that have no pending client signature token", async () => {
    p.authorityFormInstance.findMany.mockResolvedValue([
      {
        id: "afi_2",
        status: "PENDING_SIGNATURES",
        authorityDescription: "x",
        template: { name: "X" },
        signatures: [{ signatureRequestToken: null }],
      },
    ]);
    const { authorities } = (await (await GET(req(), params)).json()).data;
    expect(authorities).toEqual([]);
  });
});
