/**
 * RA-7610 B2: a reading linked to a room keeps its sketchRoomId after
 * the draft-snapshot delete-and-recreate round trip.
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
import { buildMoistureReadingDraftPayload } from "@/lib/forms/moisture-reading-draft-payload";

const mockSession = vi.mocked(getServerSession);

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
  sketchRoomFindMany.mockResolvedValue([{ id: "sr-living" }]);
  transaction.mockImplementation(
    async (callback: (client: typeof tx) => unknown) => callback(tx),
  );
});

describe("PUT inspection draft snapshot — RA-7610 room-link round trip", () => {
  it("keeps sketchRoomId on a linked reading after a draft-save round trip", async () => {
    const linked = {
      location: "Living room",
      surfaceType: "carpet",
      moistureLevel: 22,
      depth: "Surface",
      sketchRoomId: "sr-living",
    };
    const body = {
      lossDescription: "Burst pipe",
      environmentalData: {
        ambientTemperature: 25,
        humidityLevel: 60,
        dewPoint: 16.7,
        airCirculation: true,
        weatherConditions: "Fine",
      },
      moistureReadings: [buildMoistureReadingDraftPayload(linked, null)],
      affectedAreas: [],
      scopeItems: [],
    };

    const response = await PUT(
      new NextRequest(
        "http://localhost/api/inspections/insp_1/draft-snapshot",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
      { params: Promise.resolve({ id: "insp_1" }) },
    );

    expect(response.status).toBe(200);
    expect(tx.moistureReading.deleteMany).toHaveBeenCalled();
    expect(tx.moistureReading.createMany).toHaveBeenCalledTimes(1);
    const written = (
      tx.moistureReading.createMany.mock.calls[0][0] as {
        data: Array<{ sketchRoomId?: string | null }>;
      }
    ).data[0];
    expect(written.sketchRoomId).toBe("sr-living");
  });
});
