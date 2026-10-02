import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const { resolveInspectionWrite, inspectionFindUnique, areaFindMany, sketchRoomFindMany, transaction, tx } =
  vi.hoisted(() => {
    const tx = {
      inspection: { update: vi.fn() },
      environmentalData: { deleteMany: vi.fn(), create: vi.fn() },
      moistureReading: { deleteMany: vi.fn(), createMany: vi.fn() },
      affectedArea: { deleteMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
      scopeItem: { deleteMany: vi.fn(), createMany: vi.fn() },
      waterDamageClassification: { upsert: vi.fn() },
      auditLog: { create: vi.fn() },
      classification: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
    };
    return {
      resolveInspectionWrite: vi.fn(),
      inspectionFindUnique: vi.fn(),
      areaFindMany: vi.fn(),
      sketchRoomFindMany: vi.fn(),
      transaction: vi.fn(),
      tx,
    };
  });

vi.mock("@/lib/auth/assert-tenancy", () => ({ resolveInspectionWrite }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: inspectionFindUnique },
    affectedArea: { findMany: areaFindMany },
    sketchRoom: { findMany: sketchRoomFindMany },
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

/** Every form save says which readings it loaded (B23); none, unless a test says so. */
function request(body: object = payload) {
  return new NextRequest("http://localhost/api/inspections/insp_1/draft-snapshot", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseIds: { moistureReadings: [] }, ...body }),
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
  areaFindMany.mockResolvedValue([]);
  sketchRoomFindMany.mockResolvedValue([{ id: "sr-kitchen" }]);
  tx.affectedArea.updateMany.mockResolvedValue({ count: 1 });
  transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
    callback(tx),
  );
});

describe("PUT inspection draft snapshot", () => {
  it("accepts an unmeasured draft without creating an environmental reading", async () => {
    const response = await PUT(request({ ...payload, environmentalData: null }), {
      params: Promise.resolve({ id: "insp_1" }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).counts.environmentalData).toBe(0);
    expect(tx.environmentalData.deleteMany).toHaveBeenCalledOnce();
    expect(tx.environmentalData.create).not.toHaveBeenCalled();
  });
  it("keeps attendance unknown and creates no invented area, reading, or classification", async () => {
    const response = await PUT(request({
      lossDescription: "Source brief only",
      inspectionDate: null,
      environmentalData: null,
      moistureReadings: [],
      affectedAreas: [],
      scopeItems: [],
      manualClassification: null,
    }), { params: Promise.resolve({ id: "insp_1" }) });
    expect(response.status).toBe(200);
    expect(tx.inspection.update.mock.calls[0][0].data.inspectionDate).toBeNull();
    expect(tx.environmentalData.create).not.toHaveBeenCalled();
    expect(tx.moistureReading.createMany).not.toHaveBeenCalled();
    expect(tx.affectedArea.createMany).not.toHaveBeenCalled();
    expect(tx.waterDamageClassification.upsert).not.toHaveBeenCalled();
  });

  it("stores a supplied attendance date and rejects malformed dates", async () => {
    const context = { params: Promise.resolve({ id: "insp_1" }) };
    expect((await PUT(request({ ...payload, inspectionDate: "2026-10-01" }), context)).status).toBe(200);
    expect(tx.inspection.update.mock.calls[0][0].data.inspectionDate.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    vi.clearAllMocks();
    expect((await PUT(request({ ...payload, inspectionDate: "not-a-date" }), context)).status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });
  it("rejects partial readings instead of inventing the missing measurement", async () => {
    const response = await PUT(request({
      ...payload,
      environmentalData: { ...payload.environmentalData, humidityLevel: null },
    }), { params: Promise.resolve({ id: "insp_1" }) });
    expect(response.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });
  it("replaces editable child rows on every save instead of appending", async () => {
    const context = { params: Promise.resolve({ id: "insp_1" }) };

    const first = await PUT(request(), context);
    const second = await PUT(request(), context);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await first.json()).counts.environmentalData).toBe(1);
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

  it("retains baseline and monitoring flags when recreating a linked reading", async () => {
    const reading = {
      ...payload.moistureReadings[0],
      sketchRoomId: "sr-kitchen",
      isBaseline: true,
      isMonitoringPoint: true,
    };
    const response = await PUT(request({ ...payload, moistureReadings: [reading] }), {
      params: Promise.resolve({ id: "insp_1" }),
    });
    expect(response.status).toBe(200);
    expect(tx.moistureReading.createMany.mock.calls[0][0].data[0]).toMatchObject({
      isBaseline: true,
      isMonitoringPoint: true,
    });
  });

  it("retains two numbered bedrooms and their distinct IDs across saves", async () => {
    const areas = [
      {
        ...payload.affectedAreas[0],
        id: "7df236bb-358c-413f-95ed-86a8a648c4f0",
        roomZoneId: "Bedroom 3",
      },
      {
        ...payload.affectedAreas[0],
        id: "5eae5124-901b-4129-afb0-267d2f9a39a5",
        roomZoneId: "Bedroom 4",
      },
    ];
    const context = { params: Promise.resolve({ id: "insp_1" }) };
    expect((await PUT(request({ ...payload, affectedAreas: areas }), context)).status).toBe(200);
    areaFindMany.mockResolvedValue(areas.map((area) => ({ id: area.id })));
    expect((await PUT(request({ ...payload, affectedAreas: areas }), context)).status).toBe(200);
    expect(tx.affectedArea.createMany).toHaveBeenCalledOnce();
    expect(tx.affectedArea.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.affectedArea.deleteMany).toHaveBeenLastCalledWith({
      where: { inspectionId: "insp_1", id: { notIn: areas.map((area) => area.id) } },
    });
    expect(tx.affectedArea.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: areas[0].id, inspectionId: "insp_1" },
      data: { roomZoneId: "Bedroom 3" },
    });
    expect(tx.affectedArea.updateMany.mock.calls[0][0].data).not.toHaveProperty("roomId");
    expect(tx.affectedArea.updateMany.mock.calls[0][0].data).not.toHaveProperty("photos");
  });

  it("queries only this inspection and treats unknown or foreign legacy IDs alike", async () => {
    const area = { ...payload.affectedAreas[0], id: "7df236bb-358c-413f-95ed-86a8a648c4f0" };
    const context = { params: Promise.resolve({ id: "insp_1" }) };
    const duplicate = await PUT(request({ ...payload, affectedAreas: [area, area] }), context);
    expect(duplicate.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();

    const legacyArea = { ...area, id: "area_12345678" };
    const unknown = await PUT(request({ ...payload, affectedAreas: [legacyArea] }), context);
    expect(unknown.status).toBe(422);
    expect((await unknown.json()).error.message).toBe("Invalid affected area ID");
    expect(areaFindMany).toHaveBeenCalledWith({
      where: { id: { in: [legacyArea.id] }, inspectionId: "insp_1" },
      select: { id: true },
      take: 1,
    });
    // A foreign row is invisible to the scoped query and gets the same result.
    areaFindMany.mockResolvedValue([]);
    const foreign = await PUT(request({ ...payload, affectedAreas: [legacyArea] }), context);
    expect(foreign.status).toBe(unknown.status);
    expect((await foreign.json()).error.message).toBe("Invalid affected area ID");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("returns a generic validation error for a rare new UUID collision", async () => {
    const area = { ...payload.affectedAreas[0], id: "7df236bb-358c-413f-95ed-86a8a648c4f0" };
    tx.affectedArea.createMany.mockRejectedValueOnce({ code: "P2002" });
    const response = await PUT(request({ ...payload, affectedAreas: [area] }), {
      params: Promise.resolve({ id: "insp_1" }),
    });
    expect(response.status).toBe(422);
    expect((await response.json()).error.message).toBe("Invalid affected area ID");
    expect(areaFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [area.id] }, inspectionId: "insp_1" },
    }));
  });

  it("updates an existing area without overwriting an omitted legacy description", async () => {
    const area = { ...payload.affectedAreas[0], id: "area_12345678" };
    const { description: _description, ...withoutDescription } = area;
    areaFindMany.mockResolvedValue([{ id: area.id }]);
    const response = await PUT(request({ ...payload, affectedAreas: [withoutDescription] }), {
      params: Promise.resolve({ id: "insp_1" }),
    });
    expect(response.status).toBe(200);
    expect(tx.affectedArea.updateMany.mock.calls[0][0].data).not.toHaveProperty("description");
    expect(tx.affectedArea.createMany).not.toHaveBeenCalled();
  });

  it("saves the technician name typed on the form (J-06)", async () => {
    const response = await PUT(request({ ...payload, technicianName: "J3 Tech" }), {
      params: Promise.resolve({ id: "insp_1" }),
    });

    expect(response.status).toBe(200);
    expect(tx.inspection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ technicianName: "J3 Tech" }),
      }),
    );
  });

  it("clears the technician name when the form sends it blank", async () => {
    await PUT(request({ ...payload, technicianName: "" }), {
      params: Promise.resolve({ id: "insp_1" }),
    });

    expect(tx.inspection.update.mock.calls[0][0].data.technicianName).toBeNull();
  });

  it("leaves the stored technician name alone when a client omits it", async () => {
    await PUT(request(), { params: Promise.resolve({ id: "insp_1" }) });

    expect(tx.inspection.update.mock.calls[0][0].data).not.toHaveProperty(
      "technicianName",
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
