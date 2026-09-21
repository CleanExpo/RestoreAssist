/**
 * RA-7610 B1: draft-snapshot must not write a sketchRoomId that belongs
 * to another inspection. Same rule as POST /moisture.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const {
  resolveInspectionWrite,
  inspectionFindUnique,
  sketchRoomFindMany,
  transaction,
  tx,
} = vi.hoisted(() => {
  const tx = {
    inspection: { update: vi.fn() },
    environmentalData: { deleteMany: vi.fn(), create: vi.fn() },
    moistureReading: { deleteMany: vi.fn(), createMany: vi.fn() },
    affectedArea: { deleteMany: vi.fn(), createMany: vi.fn() },
    scopeItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    waterDamageClassification: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    resolveInspectionWrite: vi.fn(),
    inspectionFindUnique: vi.fn(),
    sketchRoomFindMany: vi.fn(),
    transaction: vi.fn(),
    tx,
  };
});

vi.mock("@/lib/auth/assert-tenancy", () => ({ resolveInspectionWrite }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: inspectionFindUnique },
    sketchRoom: { findMany: sketchRoomFindMany },
    $transaction: transaction,
  },
}));

import { getServerSession } from "next-auth";
import { PUT } from "../route";

const mockSession = vi.mocked(getServerSession);

const payload = {
  lossDescription: "Burst pipe",
  environmentalData: {
    ambientTemperature: 25,
    humidityLevel: 60,
    dewPoint: 16.7,
    airCirculation: true,
    weatherConditions: "Fine",
  },
  moistureReadings: [
    {
      location: "North Wall",
      surfaceType: "carpet",
      moistureLevel: 28,
      depth: "Surface",
      sketchRoomId: "sr-other-job",
    },
  ],
  affectedAreas: [],
  scopeItems: [],
};

function request() {
  return new NextRequest(
    "http://localhost/api/inspections/insp_1/draft-snapshot",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "user_1" } } as never);
  resolveInspectionWrite.mockResolvedValue({
    ok: true,
    data: {
      inspectionWhere: { id: "insp_1" },
      inspectionManyWhere: { id: "insp_1" },
      childInspectionFilter: undefined,
    },
  });
  inspectionFindUnique.mockResolvedValue({ id: "insp_1", status: "DRAFT" });
  sketchRoomFindMany.mockResolvedValue([]);
  transaction.mockImplementation(
    async (callback: (client: typeof tx) => unknown) => callback(tx),
  );
});

describe("PUT inspection draft snapshot — RA-7610 tenancy", () => {
  it("rejects a sketchRoomId from another inspection with 422 and writes nothing", async () => {
    const response = await PUT(request(), {
      params: Promise.resolve({ id: "insp_1" }),
    });

    expect(response.status).toBe(422);
    expect(sketchRoomFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ["sr-other-job"] },
          detachedAt: null,
          sketch: { inspectionId: "insp_1" },
        },
      }),
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(tx.moistureReading.createMany).not.toHaveBeenCalled();
    expect(tx.moistureReading.deleteMany).not.toHaveBeenCalled();
  });
});
