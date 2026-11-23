/**
 * RA-7687: the mould-remediation Save and the third-party report confirm both
 * write the lab columns of one MouldRemediationAssessment row. A Save built
 * from a form loaded BEFORE a confirm must not write its old values back over
 * the confirmed ones (silent data loss on an insurance claim). The Save names
 * the row version it loaded (expectedUpdatedAt); a row that moved since is a
 * 409 and nothing is written.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = {
  inspectionId: string;
  labName: string | null;
  mouldConditionLevel: string | null;
  updatedAt: Date;
};

const h = vi.hoisted(() => {
  const store = { row: null as null | Row, clock: 1_000 };
  const m = { getServerSession: vi.fn(), assertWrite: vi.fn() };

  const stamp = (): Date => {
    store.clock += 1000;
    return new Date(store.clock);
  };

  const model = {
    findUnique: vi.fn(async () => (store.row ? { ...store.row } : null)),
    findUniqueOrThrow: vi.fn(async () => ({ ...(store.row as Row) })),
    create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
      store.row = {
        inspectionId: "insp_1",
        labName: null,
        mouldConditionLevel: null,
        ...data,
        updatedAt: stamp(),
      } as Row;
      return { ...store.row };
    }),
    // The old route used upsert, which writes unconditionally.
    upsert: vi.fn(
      async ({
        create,
        update,
      }: {
        create: Partial<Row>;
        update: Partial<Row>;
      }) => {
        store.row = store.row
          ? ({ ...store.row, ...update, updatedAt: stamp() } as Row)
          : ({
              inspectionId: "insp_1",
              labName: null,
              mouldConditionLevel: null,
              ...create,
              updatedAt: stamp(),
            } as Row);
        return { ...store.row };
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { updatedAt?: { gte: Date; lt: Date } };
        data: Partial<Row>;
      }) => {
        const r = store.row;
        if (!r) return { count: 0 };
        const w = where.updatedAt;
        if (w && !(r.updatedAt >= w.gte && r.updatedAt < w.lt))
          return { count: 0 };
        store.row = { ...r, ...data, updatedAt: stamp() };
        return { count: 1 };
      },
    ),
  };
  const inspectionUpdate = vi.fn(async () => ({}));
  return { store, m, model, inspectionUpdate, stamp };
});
const { store, m, model, inspectionUpdate, stamp } = h;

vi.mock("next-auth", () => ({ getServerSession: h.m.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionReadable: vi.fn(),
  assertInspectionAssignedWrite: h.m.assertWrite,
  resolveInspectionWrite: vi.fn(),
}));
vi.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    mouldRemediationAssessment: h.model,
    inspection: { update: h.inspectionUpdate },
    $transaction: async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
  };
  return { prisma };
});

import { POST } from "../route";

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest(
      "http://localhost/api/inspections/insp_1/mould-remediation",
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      },
    ),
    { params: Promise.resolve({ id: "insp_1" }) },
  );
}

/** What the confirm route does to the row: it sets a lab value and moves updatedAt. */
function confirmWritesNewLab() {
  store.row = { ...(store.row as Row), labName: "New Lab", updatedAt: stamp() };
}

beforeEach(() => {
  store.row = null;
  store.clock = 1_000;
  vi.clearAllMocks();
  m.getServerSession.mockResolvedValue({ user: { id: "u1" } });
  m.assertWrite.mockResolvedValue({
    ok: true,
    data: { inspectionWhere: { id: "insp_1" } },
  });
});

describe("mould-remediation POST: stale Save after a confirmed lab fact", () => {
  it("refuses a Save built before a confirm, with 409, and keeps the confirmed value", async () => {
    // The panel loads the record with labName 'Old Lab'.
    store.row = {
      inspectionId: "insp_1",
      labName: "Old Lab",
      mouldConditionLevel: null,
      updatedAt: stamp(),
    };
    const loadedAt = store.row.updatedAt.toISOString();
    // The technician confirms 'New Lab' while the older Save is still in flight.
    confirmWritesNewLab();
    // The older Save now lands, carrying the form's Old Lab.
    const res = await post({ labName: "Old Lab", expectedUpdatedAt: loadedAt });
    expect(res.status).toBe(409);
    expect(store.row?.labName).toBe("New Lab");
    expect(inspectionUpdate).not.toHaveBeenCalled();
  });

  it("accepts a Save built from the current row and returns the new version", async () => {
    store.row = {
      inspectionId: "insp_1",
      labName: "Old Lab",
      mouldConditionLevel: null,
      updatedAt: stamp(),
    };
    const res = await post({
      labName: "Edited",
      expectedUpdatedAt: store.row.updatedAt.toISOString(),
    });
    expect(res.status).toBe(200);
    expect(store.row?.labName).toBe("Edited");
    expect((await res.json()).updatedAt).toBeTruthy();
  });

  it("refuses a Save that names no version when a record already exists", async () => {
    store.row = {
      inspectionId: "insp_1",
      labName: "Old Lab",
      mouldConditionLevel: null,
      updatedAt: stamp(),
    };
    const res = await post({ labName: "Anything" });
    expect(res.status).toBe(409);
    expect(store.row?.labName).toBe("Old Lab");
  });

  it("creates the first record when none exists", async () => {
    const res = await post({ labName: "First", expectedUpdatedAt: null });
    expect(res.status).toBe(200);
    expect(store.row?.labName).toBe("First");
  });

  it("refuses a Save from a form that loaded no record when one has since been created", async () => {
    store.row = {
      inspectionId: "insp_1",
      labName: "Confirmed",
      mouldConditionLevel: null,
      updatedAt: stamp(),
    };
    const res = await post({ labName: "Stale", expectedUpdatedAt: null });
    expect(res.status).toBe(409);
    expect(store.row?.labName).toBe("Confirmed");
  });
});
