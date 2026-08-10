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
  lossDescription: "Mock burst pipe loss",
  environmentalData: {
    ambientTemperature: 25,
    humidityLevel: 60,
    dewPoint: 16.7,
    airCirculation: true,
    weatherConditions: "Fine",
  },
  moistureReadings: [
    {
      location: "Master Bedroom",
      surfaceType: "Carpet",
      moistureLevel: 42,
      depth: "Surface",
      mapX: 0.25,
      mapY: 0.5,
    },
  ],
  affectedAreas: [
    {
      roomZoneId: "Master Bedroom",
      affectedAreaSqm: 22,
      waterSource: "Clean Water",
      timeSinceLoss: 24,
      description: "Mock affected area",
    },
  ],
  scopeItems: [
    {
      itemType: "extract_standing_water",
      description: "Extract Standing Water",
      specification: "Mock scope",
    },
  ],
  manualClassification: { category: "1", class: "2" },
};

function request() {
  return new NextRequest("http://localhost/api/inspections/insp_1/draft-snapshot", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
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
  transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
    callback(tx),
  );
});

describe("PUT inspection draft snapshot", () => {
  it("replaces editable child rows on every save instead of appending", async () => {
    const context = { params: Promise.resolve({ id: "insp_1" }) };

    const first = await PUT(request(), context);
    const second = await PUT(request(), context);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(tx.moistureReading.deleteMany).toHaveBeenCalledTimes(2);
    expect(tx.moistureReading.createMany).toHaveBeenCalledTimes(2);
    expect(tx.affectedArea.deleteMany).toHaveBeenCalledTimes(2);
    expect(tx.affectedArea.createMany).toHaveBeenCalledTimes(2);
    expect(tx.scopeItem.deleteMany).toHaveBeenCalledTimes(2);
    expect(tx.scopeItem.createMany).toHaveBeenCalledTimes(2);
    expect(tx.waterDamageClassification.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          waterCategory: "CAT_1",
          damageClass: "CLASS_2",
        }),
      }),
    );
  });

  it("rejects non-draft synchronisation before mutating child rows", async () => {
    inspectionFindUnique.mockResolvedValue({
      id: "insp_1",
      status: "SUBMITTED",
    });

    const response = await PUT(request(), {
      params: Promise.resolve({ id: "insp_1" }),
    });

    expect(response.status).toBe(409);
    expect(transaction).not.toHaveBeenCalled();
  });
});
