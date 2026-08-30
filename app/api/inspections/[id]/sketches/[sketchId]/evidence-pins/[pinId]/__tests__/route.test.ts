import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/sketch/sync-room-graph", () => ({
  resolveEvidenceRoomLink: vi.fn(() => null),
}));
vi.mock("../sign-response", () => ({
  signEvidencePinUrls: vi.fn(async (pin) => pin),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    evidencePin: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    sketchRoom: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { DELETE, PATCH } from "../route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  evidencePin: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  sketchRoom: { findFirst: ReturnType<typeof vi.fn> };
};

const context = {
  params: Promise.resolve({
    id: "inspection-1",
    sketchId: "sketch-1",
    pinId: "pin-1",
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "user-1" } });
});

describe("evidence pin child-tenancy boundary", () => {
  it.each([
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ] as const)(
    "returns 404 for a %s attempt with a foreign pin",
    async (method, handler) => {
      db.evidencePin.findFirst.mockResolvedValue(null);
      const request = new NextRequest(
        "http://localhost/api/inspections/inspection-1/sketches/sketch-1/evidence-pins/pin-1",
        {
          method,
          ...(method === "PATCH"
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ caption: "tampered" }),
              }
            : {}),
        },
      );

      const response = await handler(request, context);

      expect(response.status).toBe(404);
      expect(db.evidencePin.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "pin-1",
            sketchId: "sketch-1",
            sketch: { inspectionId: "inspection-1" },
          },
        }),
      );
      expect(db.evidencePin.update).not.toHaveBeenCalled();
      expect(db.evidencePin.delete).not.toHaveBeenCalled();
    },
  );

  it("rejects assigning a pin to a room from another sketch", async () => {
    db.evidencePin.findFirst.mockResolvedValue({ id: "pin-1", x: 10, y: 20 });
    db.sketchRoom.findFirst.mockResolvedValue(null);
    const request = new NextRequest(
      "http://localhost/api/inspections/inspection-1/sketches/sketch-1/evidence-pins/pin-1",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sketchRoomId: "foreign-room" }),
      },
    );

    const response = await PATCH(request, context);

    expect(response.status).toBe(400);
    expect(db.sketchRoom.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "foreign-room", sketchId: "sketch-1" },
      }),
    );
    expect(db.evidencePin.update).not.toHaveBeenCalled();
  });
});
