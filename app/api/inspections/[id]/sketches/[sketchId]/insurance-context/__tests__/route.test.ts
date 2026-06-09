import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { insuranceContext: { upsert: vi.fn() } },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  insuranceContext: { upsert: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.insuranceContext.upsert.mockImplementation(async ({ create }: any) => ({
    id: "ic_1",
    ...create,
  }));
});

const post = (body: object) =>
  new NextRequest(
    "http://localhost/api/inspections/i1/sketches/s1/insurance-context",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

const params = { params: Promise.resolve({ id: "i1", sketchId: "s1" }) };

describe("POST insurance-context", () => {
  it("upserts the claim pathway by sketchId", async () => {
    const res = await POST(
      post({ pathway: "nz_nhcover", notes: "Flood — land to NHCover" }),
      params,
    );
    expect(res.status).toBe(200);
    const arg = p.insuranceContext.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ sketchId: "s1" });
    expect(arg.create.pathway).toBe("nz_nhcover");
    expect(arg.update.pathway).toBe("nz_nhcover");
  });

  it("422 on an unknown pathway", async () => {
    const res = await POST(post({ pathway: "us_carrier" }), params);
    expect(res.status).toBe(422);
    expect(p.insuranceContext.upsert).not.toHaveBeenCalled();
  });

  it("422 when pathway is missing", async () => {
    const res = await POST(post({ notes: "x" }), params);
    expect(res.status).toBe(422);
  });

  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(post({ pathway: "au_private" }), params);
    expect(res.status).toBe(401);
  });
});
