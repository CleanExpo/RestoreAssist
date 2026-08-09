import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    claimSketch: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    material: { findMany: vi.fn() },
    sketchElement: { deleteMany: vi.fn(), createMany: vi.fn() },
    sketchMoistureReading: { deleteMany: vi.fn(), createMany: vi.fn() },
    sketchRoom: {
      findMany: vi.fn(async () => []),
      update: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async () => []),
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  claimSketch: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  material: { findMany: ReturnType<typeof vi.fn> };
};

const STORED_URL = "https://storage.example.test/sketch-media/underlay.png";

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.material.findMany.mockResolvedValue([]);
  p.claimSketch.findFirst.mockResolvedValue({
    id: "s_existing",
    backgroundImageUrl: STORED_URL,
    updatedAt: new Date("2026-01-01"),
  });
  p.claimSketch.update.mockResolvedValue({ id: "s_existing" });
});

function makePost(body: object): NextRequest {
  return new NextRequest("http://localhost/api/inspections/i1/sketches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("sketch POST → backgroundImageUrl persistence", () => {
  it("persists explicit null when clearing an existing underlay", async () => {
    const response = await POST(
      makePost({ floorNumber: 0, backgroundImageUrl: null }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(response.status).toBe(201);
    expect(p.claimSketch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ backgroundImageUrl: null }),
      }),
    );
  });

  it("leaves an existing underlay unchanged when the field is omitted", async () => {
    const response = await POST(makePost({ floorNumber: 0 }), {
      params: Promise.resolve({ id: "i1" }),
    });

    expect(response.status).toBe(201);
    expect(p.claimSketch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ backgroundImageUrl: undefined }),
      }),
    );
  });
});
