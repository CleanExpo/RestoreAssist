import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
    material: { findMany: vi.fn() },
    claimSketch: { findMany: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { POST } from "../route";

const mockTenancy = assertInspectionTenancy as unknown as ReturnType<
  typeof vi.fn
>;

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  inspection: { findUnique: ReturnType<typeof vi.fn> };
  material: { findMany: ReturnType<typeof vi.fn> };
  claimSketch: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.inspection.findUnique.mockResolvedValue({ propertyAddress: "1 Test St" });
  p.material.findMany.mockResolvedValue([
    { slug: "fibro", name: "Fibro", isPotentialAcm: true },
  ]);
  p.claimSketch.findMany.mockResolvedValue([
    { moisturePoints: [], country: "AU" },
  ]);
});

const FLOORS = [
  {
    label: "Ground",
    fabricJson: {
      objects: [
        {
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 300, y: 0 },
            { x: 300, y: 400 },
            { x: 0, y: 400 },
          ],
          data: { type: "room", material: "fibro", label: "Bathroom" },
        },
      ],
    },
  },
];

const post = (body: object) =>
  new NextRequest(
    "http://localhost/api/inspections/i1/sketches/scope-narrative",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

const params = { params: Promise.resolve({ id: "i1" }) };

describe("POST scope-narrative", () => {
  it("returns the S500 scope-of-works as Markdown", async () => {
    const res = await POST(post({ floors: FLOORS }), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/markdown/);
    const md = await res.text();
    expect(md).toContain("# Scope of Works");
    expect(md).toContain("ANSI/IICRC S500:2021");
    expect(md).toContain("Bathroom");
    expect(md).toMatch(/suspected asbestos|ACM/i);
  });

  it("422 when floors[] is missing", async () => {
    const res = await POST(post({}), params);
    expect(res.status).toBe(422);
  });

  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(post({ floors: FLOORS }), params);
    expect(res.status).toBe(401);
  });

  it("403 when the caller fails the inspection tenancy check", async () => {
    mockTenancy.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: "forbidden",
    });
    const res = await POST(post({ floors: FLOORS }), params);
    expect(res.status).toBe(403);
  });
});
