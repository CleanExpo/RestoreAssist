import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { claimSketch: { findFirst: vi.fn(), update: vi.fn() } },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { PUT } from "../route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const update = (
  prisma as unknown as { claimSketch: { update: ReturnType<typeof vi.fn> } }
).claimSketch.update;

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "user-1" } });
});

describe("legacy sketch partial update", () => {
  it("cannot bypass the provenance-aware collection save route", async () => {
    const response = await PUT(
      new NextRequest(
        "http://localhost/api/inspections/inspection-1/sketches/sketch-1",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            backgroundImageUrl: "https://attacker.test/reference.png",
            sketchData: { objects: [] },
          }),
        },
      ),
      {
        params: Promise.resolve({ id: "inspection-1", sketchId: "sketch-1" }),
      },
    );

    expect(response.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });
});
