/**
 * RA-7610: a typed room height on an affected area must be stored, not
 * stripped by affectedAreaSchema. On main the field is dropped by zod.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const { resolveInspectionWrite, inspectionFindUnique, transaction, tx } =
  vi.hoisted(() => {
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
      transaction: vi.fn(),
      tx,
    };
  });

vi.mock("@/lib/auth/assert-tenancy", () => ({ resolveInspectionWrite }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: inspectionFindUnique },
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
  moistureReadings: [],
  affectedAreas: [
    {
      roomZoneId: "Living room",
      affectedAreaSqm: 22,
      waterSource: "Clean Water",
      timeSinceLoss: 24,
      description: "Lounge",
      height: 2.7,
    },
  ],
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
  transaction.mockImplementation(
    async (callback: (client: typeof tx) => unknown) => callback(tx),
  );
});

describe("PUT inspection draft snapshot — RA-7610 room height", () => {
  it("stores a typed height on an affected area instead of stripping it", async () => {
    const response = await PUT(request(), {
      params: Promise.resolve({ id: "insp_1" }),
    });

    expect(response.status).toBe(200);
    expect(tx.affectedArea.createMany).toHaveBeenCalledTimes(1);
    const created = (
      tx.affectedArea.createMany.mock.calls[0][0] as {
        data: Array<{ height?: number }>;
      }
    ).data[0];
    expect(created.height).toBe(2.7);
  });

  it("stores an out-of-range height as null instead of rejecting the whole draft", async () => {
    const tooTall = {
      ...payload,
      affectedAreas: [{ ...payload.affectedAreas[0], height: 27 }],
    };
    const tooShort = {
      ...payload,
      affectedAreas: [{ ...payload.affectedAreas[0], height: -1 }],
    };

    for (const body of [tooTall, tooShort]) {
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
      transaction.mockImplementation(
        async (callback: (client: typeof tx) => unknown) => callback(tx),
      );

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
      const created = (
        tx.affectedArea.createMany.mock.calls[0][0] as {
          data: Array<{ height?: number | null; roomZoneId: string }>;
        }
      ).data[0];
      expect(created.height).toBeNull();
      expect(created.roomZoneId).toBe("Living room");
    }
  });
});
