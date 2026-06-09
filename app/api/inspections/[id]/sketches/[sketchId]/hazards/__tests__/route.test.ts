/**
 * POST /api/inspections/[id]/sketches/[sketchId]/hazards — record a WHS hazard
 * (spec §5.3). Suspected ACM + a recorded pathway is what un-gates strip-out scope.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { hazard: { create: vi.fn() } },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  hazard: { create: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.hazard.create.mockImplementation(async ({ data }: any) => ({
    id: "hz_1",
    ...data,
  }));
});

function post(body: object): NextRequest {
  return new NextRequest(
    "http://localhost/api/inspections/i1/sketches/s1/hazards",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const params = { params: Promise.resolve({ id: "i1", sketchId: "s1" }) };

describe("POST hazards", () => {
  it("records a suspected hazard by default", async () => {
    const res = await POST(post({ type: "asbestos", elementId: "e1" }), params);
    expect(res.status).toBe(201);
    const data = p.hazard.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      sketchId: "s1",
      elementId: "e1",
      type: "asbestos",
      status: "suspected",
    });
  });

  it("passes through a recorded WHS pathway + status", async () => {
    const res = await POST(
      post({
        type: "asbestos",
        status: "licensed_removal_required",
        whsPathwayNote: "Licensed non-friable removalist engaged (QLD)",
      }),
      params,
    );
    expect(res.status).toBe(201);
    const data = p.hazard.create.mock.calls[0][0].data;
    expect(data.status).toBe("licensed_removal_required");
    expect(data.whsPathwayNote).toMatch(/removalist/i);
  });

  it("422 on an unknown hazard type", async () => {
    const res = await POST(post({ type: "dragons" }), params);
    expect(res.status).toBe(422);
    expect(p.hazard.create).not.toHaveBeenCalled();
  });

  it("422 when type is missing", async () => {
    const res = await POST(post({ elementId: "e1" }), params);
    expect(res.status).toBe(422);
  });

  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(post({ type: "asbestos" }), params);
    expect(res.status).toBe(401);
  });
});
