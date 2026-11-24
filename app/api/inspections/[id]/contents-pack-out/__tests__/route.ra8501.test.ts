/**
 * RA-8501 (DRC S8) — contents inventory: room link and Excel export.
 *
 * Export: who may download it, and that money reaches only an ADMIN or
 * MANAGER. The money check reads every cell of every sheet in the bytes the
 * route returns, looking for a planted figure (98765.43).
 * POST: a room must belong to this job and not be detached.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { expectRefused } from "@/tests/helpers/expect-refused";

const getServerSession = vi.fn();
const assertInspectionReadable = vi.fn();
const assertInspectionTenancy = vi.fn();
const assertFinancialWriter = vi.fn();
const resolveInspectionWrite = vi.fn();
const writeWithinInspectionScope = vi.fn();
const inspectionFindUnique = vi.fn();
const itemFindMany = vi.fn();
const itemCreate = vi.fn();
const sketchRoomFindFirst = vi.fn();
const sketchRoomFindMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// RA-8494: the caller here is an owner and the subject is the room link, not
// the money rule, so the shared owner double stands in for redact-money.
vi.mock("@/lib/auth/redact-money");
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    req: Request,
    _userId: unknown,
    handler: (raw: string) => Promise<Response>,
  ) => handler(await req.text()),
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionReadable: (...a: unknown[]) => assertInspectionReadable(...a),
  assertInspectionTenancy: (...a: unknown[]) => assertInspectionTenancy(...a),
  assertFinancialWriter: (...a: unknown[]) => assertFinancialWriter(...a),
  resolveInspectionWrite: (...a: unknown[]) => resolveInspectionWrite(...a),
  writeWithinInspectionScope: (...a: unknown[]) => writeWithinInspectionScope(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: (...a: unknown[]) => inspectionFindUnique(...a) },
    contentsPackOutItem: {
      findMany: (...a: unknown[]) => itemFindMany(...a),
      create: (...a: unknown[]) => itemCreate(...a),
    },
    sketchRoom: {
      findFirst: (...a: unknown[]) => sketchRoomFindFirst(...a),
      findMany: (...a: unknown[]) => sketchRoomFindMany(...a),
    },
  },
}));

import { GET as exportGET } from "../export/route";
import { GET as listGET, POST } from "../route";

const PLANTED = 98765.43;
const params = { params: Promise.resolve({ id: "insp_1" }) };

const inspection = {
  inspectionNumber: "NIR-2026-11-0042",
  jobNumber: "DRC-00042",
  propertyAddress: "1 Example Street",
  propertyPostcode: "2000",
  claimNumber: "CLM-1",
  policyNumber: "POL-9",
  clientType: "LOSS_ADJUSTER",
  insuredName: "Sam Example",
  claimType: "WATER",
  inspectionDate: null,
  technicianName: "Alex Tech",
  insurerProfile: { name: "Example Insurer" },
};

/** What the database would return for the select the route sends. */
function itemsFor(select: Record<string, unknown>) {
  const row: Record<string, unknown> = {
    itemDescription: "Washing machine",
    make: "Example",
    model: "WM-100",
    serialNumber: "SN-123",
    packOutDecision: "TOTAL_LOSS",
    packOutTag: null,
    conditionPreLoss: null,
    conditionPostLoss: null,
    beforePhotoUrl: null,
    afterPhotoUrl: null,
    sketchRoom: { name: "Laundry" },
    replacementValueAud: PLANTED,
    restorationCostEstimate: PLANTED,
  };
  return [Object.fromEntries(Object.entries(row).filter(([k]) => k in select))];
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  assertInspectionReadable.mockResolvedValue({
    ok: true,
    data: { id: "insp_1", userId: "owner_1", workspaceId: null },
  });
  // The write-scope gate refuses everyone here: the export must not use it.
  assertInspectionTenancy.mockResolvedValue({
    ok: false,
    status: 404,
    reason: "Inspection not found",
  });
  assertFinancialWriter.mockResolvedValue({
    ok: false,
    status: 403,
    reason: "Only an owner or manager can do this",
  });
  inspectionFindUnique.mockResolvedValue(inspection);
  itemFindMany.mockImplementation(async (args: { select: Record<string, unknown> }) =>
    itemsFor(args.select),
  );
});

function exportReq() {
  return new NextRequest(
    "http://localhost/api/inspections/insp_1/contents-pack-out/export",
  );
}

async function cellsOf(res: Response): Promise<{ wb: ExcelJS.Workbook; values: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  const values: string[] = [];
  wb.eachSheet((ws) =>
    ws.eachRow((row) => row.eachCell((cell) => values.push(String(cell.value)))),
  );
  return { wb, values };
}

describe("GET contents-pack-out/export", () => {
  it("refuses without a session", async () => {
    getServerSession.mockResolvedValue(null);
    await expectRefused(await exportGET(exportReq(), params), 401, /Unauthorized/);
    expect(itemFindMany).not.toHaveBeenCalled();
  });

  it("refuses a job out of read reach with 404 and reads nothing", async () => {
    assertInspectionReadable.mockResolvedValue({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });
    await expectRefused(await exportGET(exportReq(), params), 404, /Inspection not found/);
    expect(inspectionFindUnique).not.toHaveBeenCalled();
    expect(itemFindMany).not.toHaveBeenCalled();
  });

  it("gives a technician the inventory with no money in any cell", async () => {
    const res = await exportGET(exportReq(), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    const { wb, values } = await cellsOf(res);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Claim details", "Inventory"]);
    expect(values).toContain("WM-100");
    expect(values).toContain("Laundry");
    expect(values).toContain("Non-restorable");
    for (const v of values) {
      expect(v).not.toContain("98765");
      expect(v).not.toMatch(/Replacement value|Restoration estimate/);
    }
    // Money is not even selected for a caller who may not see it.
    const select = itemFindMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("replacementValueAud");
    expect(select).not.toHaveProperty("restorationCostEstimate");
  });

  /** A job holding `n` items, served page by page the way Prisma honours take / cursor / skip. */
  function serveJobOf(n: number) {
    const rows = Array.from({ length: n }, (_, i) => ({
      id: `item_${String(i + 1).padStart(5, "0")}`,
      itemDescription: `Item ${i + 1}`,
      make: null,
      model: null,
      serialNumber: null,
      packOutDecision: "PACK_OUT",
      packOutTag: null,
      conditionPreLoss: null,
      conditionPostLoss: null,
      beforePhotoUrl: null,
      afterPhotoUrl: null,
      sketchRoom: null,
    }));
    itemFindMany.mockImplementation(
      async (args: { take?: number; skip?: number; cursor?: { id: string } }) => {
        let start = 0;
        if (args.cursor) start = rows.findIndex((r) => r.id === args.cursor!.id) + (args.skip ?? 0);
        return rows.slice(start, args.take === undefined ? undefined : start + args.take);
      },
    );
  }

  // RA-8501 review round 1 (P1): a single `take: 500` dropped item 501 onward
  // without a word. Every item must reach the file.
  it("exports every item of a job with more than one page of items", async () => {
    serveJobOf(1201);
    const res = await exportGET(exportReq(), params);
    expect(res.status).toBe(200);
    const { wb, values } = await cellsOf(res);
    const inv = wb.getWorksheet("Inventory")!;
    expect(inv.rowCount).toBe(1202);
    expect(values).toContain("Item 1");
    expect(values).toContain("Item 1201");
    let items = "";
    wb.getWorksheet("Claim details")!.eachRow((row) => {
      if (row.getCell(1).value === "Items") items = String(row.getCell(2).value);
    });
    expect(items).toBe("1201");
  });

  it("refuses, rather than cuts short, a job with more items than one file holds", async () => {
    serveJobOf(5001);
    await expectRefused(
      await exportGET(exportReq(), params),
      413,
      /more than 5000 contents items/,
    );
  });

  it("gives an owner or manager the money columns, on a colleague's job too", async () => {
    assertFinancialWriter.mockResolvedValue({
      ok: true,
      data: { id: "user_1", role: "MANAGER" },
    });
    const res = await exportGET(exportReq(), params);
    expect(res.status).toBe(200);
    const { values } = await cellsOf(res);
    expect(values).toContain("Replacement value (AUD)");
    expect(values).toContain(String(PLANTED));
    expect(assertInspectionReadable).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: "user_1" } }),
      "insp_1",
    );
    expect(assertInspectionTenancy).not.toHaveBeenCalled();
  });
});

function postReq(body: unknown) {
  return new NextRequest(
    "http://localhost/api/inspections/insp_1/contents-pack-out",
    { method: "POST", body: JSON.stringify(body) },
  );
}

describe("POST contents-pack-out room link", () => {
  beforeEach(() => {
    resolveInspectionWrite.mockResolvedValue({
      ok: true,
      data: { inspectionManyWhere: { id: "insp_1" } },
    });
    writeWithinInspectionScope.mockImplementation(
      async (_where: unknown, _data: unknown, work: (tx: unknown) => unknown) =>
        work({ contentsPackOutItem: { create: (...a: unknown[]) => itemCreate(...a) } }),
    );
    itemCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "item_1",
      ...args.data,
    }));
  });

  it("refuses a room that is not this job's, or is detached, and writes nothing", async () => {
    sketchRoomFindFirst.mockResolvedValue(null);
    await expectRefused(
      await POST(postReq({ itemDescription: "Sofa", sketchRoomId: "room_other" }), params),
      422,
      /does not belong to this job/,
    );
    expect(sketchRoomFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "room_other",
          detachedAt: null,
          sketch: { inspectionId: "insp_1" },
        },
      }),
    );
    expect(itemCreate).not.toHaveBeenCalled();
  });

  it("stores a room that belongs to this job", async () => {
    sketchRoomFindFirst.mockResolvedValue({ id: "room_1" });
    const res = await POST(
      postReq({ itemDescription: "Sofa", sketchRoomId: "room_1", packOutDecision: "PACK_OUT" }),
      params,
    );
    expect(res.status).toBe(201);
    expect(itemCreate.mock.calls[0][0].data).toMatchObject({
      sketchRoomId: "room_1",
      packOutDecision: "PACK_OUT",
    });
  });

  it("stores no room when none is given", async () => {
    const res = await POST(postReq({ itemDescription: "Sofa" }), params);
    expect(res.status).toBe(201);
    expect(sketchRoomFindFirst).not.toHaveBeenCalled();
    expect(itemCreate.mock.calls[0][0].data.sketchRoomId).toBeNull();
  });
});

describe("GET contents-pack-out lists the job's rooms", () => {
  it("returns the attachable rooms and each item's room name", async () => {
    assertInspectionTenancy.mockResolvedValue({
      ok: true,
      data: { id: "insp_1", userId: "user_1", workspaceId: null },
    });
    itemFindMany.mockResolvedValue([
      { id: "item_1", packOutDecision: "PACK_OUT", replacementValueAud: null, sketchRoom: { id: "room_1", name: "Laundry" } },
    ]);
    sketchRoomFindMany.mockResolvedValue([{ id: "room_1", name: "Laundry", floorNumber: 0 }]);
    const res = await listGET(
      new NextRequest("http://localhost/api/inspections/insp_1/contents-pack-out"),
      params,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rooms).toEqual([{ id: "room_1", name: "Laundry", floorNumber: 0 }]);
    expect(body.items[0].sketchRoom).toEqual({ id: "room_1", name: "Laundry" });
    expect(sketchRoomFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { detachedAt: null, sketch: { inspectionId: "insp_1" } },
      }),
    );
  });
});
