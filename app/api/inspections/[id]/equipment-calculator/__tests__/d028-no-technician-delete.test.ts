/**
 * D-028 — the equipment calculator deletes only rows it created, for the
 * assigned technician.
 *
 * The owner's recalculation replaces every auto-determined equipment row, as
 * before. The technician's may replace only rows tagged as the calculator's
 * own; when untagged equipment rows exist (a Category 3 checklist's air
 * scrubber, lib/iicrc-checklists.ts), it refuses with 409 and writes nothing.
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
  m.scopeItemCount.mockResolvedValue(0);
  m.txDeleteMany.mockResolvedValue({ count: 0 });
  m.txCreateMany.mockResolvedValue({ count: 1 });
});

describe("equipment-calculator POST deletes (D-028)", () => {
  it("refuses the technician with 409 when untagged equipment rows exist, and writes nothing", async () => {
    m.session.mockResolvedValue({ user: { id: "tech-1" } });
    grant(true);
    m.scopeItemCount.mockResolvedValue(1);
    const res = await calculate();
    expect(res.status, await res.clone().text()).toBe(409);
    expect(m.txDeleteMany).not.toHaveBeenCalled();
    expect(m.txCreateMany).not.toHaveBeenCalled();
  });

  it("lets the technician replace only the calculator's own tagged rows", async () => {
    m.session.mockResolvedValue({ user: { id: "tech-1" } });
    grant(true);
    const res = await calculate();
    expect(res.status, await res.clone().text()).toBe(200);
    expect(m.txDeleteMany).toHaveBeenCalledWith({
      where: { inspectionId: "insp-1", source: "equipment_calculator" },
    });
    const rows = m.txCreateMany.mock.calls[0][0].data as Array<{ source: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.source === "equipment_calculator")).toBe(true);
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
