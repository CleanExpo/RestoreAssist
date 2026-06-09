import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { material: { findMany: vi.fn() } },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  material: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
});

const req = (url = "http://localhost/api/materials") =>
  new NextRequest(url, { method: "GET" });

describe("GET /api/materials", () => {
  it("returns the ANZ materials list", async () => {
    p.material.findMany.mockResolvedValueOnce([
      { id: "mat_fibro", slug: "fibro", name: "Fibro", isPotentialAcm: true },
    ]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.materials).toHaveLength(1);
    expect(json.materials[0].slug).toBe("fibro");
  });

  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("filters by region when ?region= is provided", async () => {
    p.material.findMany.mockResolvedValueOnce([]);
    await GET(req("http://localhost/api/materials?region=NZ"));
    const arg = p.material.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ region: { has: "NZ" } });
  });

  it("no region filter when omitted", async () => {
    p.material.findMany.mockResolvedValueOnce([]);
    await GET(req());
    const arg = p.material.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({});
  });
});
