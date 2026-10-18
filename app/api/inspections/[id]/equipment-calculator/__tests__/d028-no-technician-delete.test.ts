/**
 * D-028 — on the assigned technician's path the equipment calculator is
 * create-only.
 *
 * The owner's recalculation replaces every auto-determined equipment row, as
 * before. The technician deletes nothing: when the job already has any scope
 * row of the calculator's equipment types (the owner's earlier calculation,
 * tagged or not, possibly edited since; a Category 3 checklist's air
 * scrubber), it refuses with 409 and writes nothing. On a job with none, it
 * creates the rows, tagged as the calculator's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  session: vi.fn(),
  gate: vi.fn(),
  inspectionFindFirst: vi.fn(),
  scopeItemCount: vi.fn(),
  txDeleteMany: vi.fn(),
  txCreateMany: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (req: NextRequest, _u: string, h: (raw: string) => Promise<Response>) =>
    h(await req.text()),
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionAssignedWrite: m.gate,
  writeWithinInspectionScope: async (
    _scope: unknown,
    _data: unknown,
    work: (tx: unknown) => unknown,
  ) => work({ scopeItem: { deleteMany: m.txDeleteMany, createMany: m.txCreateMany } }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: m.inspectionFindFirst },
    scopeItem: { count: m.scopeItemCount },
  },
}));

import { POST } from "../route";

type Row = { inspectionId: string; itemType: string; autoDetermined: boolean; source: string | null };
let rows: Row[] = [];

function matches(r: Row, w: any): boolean {
  if (w.inspectionId !== undefined && r.inspectionId !== w.inspectionId) return false;
  if (w.autoDetermined !== undefined && r.autoDetermined !== w.autoDetermined) return false;
  if (w.itemType?.in && !w.itemType.in.includes(r.itemType)) return false;
  if (typeof w.source === "string" && r.source !== w.source) return false;
  if (w.source === null && r.source !== null) return false;
  if (w.source?.not !== undefined && (r.source === null || r.source === w.source.not)) return false;
  if (Array.isArray(w.OR) && !w.OR.some((o: unknown) => matches(r, o))) return false;
  return true;
}

const ownerEarlierRun: Row = {
  inspectionId: "insp-1",
  itemType: "air_mover",
  autoDetermined: true,
  source: "equipment_calculator",
};

const SCOPE = { id: "insp-1", technicianId: "tech-1", user: { organizationId: "org-1" } };

function grant(viaAssignment: boolean) {
  m.gate.mockResolvedValue({
    ok: true,
    data: {
      inspectionWhere: SCOPE,
      inspectionManyWhere: SCOPE,
      childInspectionFilter: { technicianId: "tech-1", user: { organizationId: "org-1" } },
      viaAssignment,
    },
  });
}

const calculate = () =>
  POST(
    new NextRequest("http://localhost/api/inspections/insp-1/equipment-calculator", {
      method: "POST",
      body: JSON.stringify({ affectedAreaM2: 20, damageClass: "CLASS_2", damageCategory: "CAT_1" }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: "insp-1" }) },
  );

beforeEach(() => {
  vi.resetAllMocks();
  m.inspectionFindFirst.mockResolvedValue({ id: "insp-1", classifications: [] });
  rows = [];
  m.scopeItemCount.mockImplementation(async (args: { where: unknown }) =>
    rows.filter((r) => matches(r, args.where)).length,
  );
  m.txDeleteMany.mockResolvedValue({ count: 0 });
  m.txCreateMany.mockResolvedValue({ count: 1 });
});

describe("equipment-calculator POST deletes (D-028)", () => {
  it("refuses the technician with 409 when the owner's earlier calculator rows exist, and deletes nothing", async () => {
    m.session.mockResolvedValue({ user: { id: "tech-1" } });
    grant(true);
    rows = [ownerEarlierRun];
    const res = await calculate();
    expect(res.status, await res.clone().text()).toBe(409);
    expect(m.txDeleteMany).not.toHaveBeenCalled();
    expect(m.txCreateMany).not.toHaveBeenCalled();
  });

  it("refuses the technician with 409 when a checklist's untagged equipment row exists", async () => {
    m.session.mockResolvedValue({ user: { id: "tech-1" } });
    grant(true);
    rows = [{ ...ownerEarlierRun, itemType: "air_scrubber", source: null }];
    const res = await calculate();
    expect(res.status).toBe(409);
    expect(m.txDeleteMany).not.toHaveBeenCalled();
    expect(m.txCreateMany).not.toHaveBeenCalled();
  });

  it("on a job with no equipment rows the technician creates tagged rows and deletes nothing", async () => {
    m.session.mockResolvedValue({ user: { id: "tech-1" } });
    grant(true);
    const res = await calculate();
    expect(res.status, await res.clone().text()).toBe(200);
    expect(m.txDeleteMany).not.toHaveBeenCalled();
    const created = m.txCreateMany.mock.calls[0][0].data as Array<{ source: string }>;
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((r) => r.source === "equipment_calculator")).toBe(true);
  });

  it("the owner's recalculation still replaces every auto-determined equipment row", async () => {
    m.session.mockResolvedValue({ user: { id: "owner-1" } });
    grant(false);
    const res = await calculate();
    expect(res.status).toBe(200);
    expect(m.scopeItemCount).not.toHaveBeenCalled();
    expect(m.txDeleteMany.mock.calls[0][0].where).toMatchObject({
      inspectionId: "insp-1",
      autoDetermined: true,
    });
  });
});
