/**
 * RA-7687: the mould-remediation Save and the third-party report confirm both
 * write the lab columns of one MouldRemediationAssessment row. A Save built
 * from a form loaded BEFORE a confirm must not write its old values back over
 * the confirmed ones (silent data loss on an insurance claim).
 *
 * The proof is the VALUES, not a timestamp: the Save names the lab values its
 * form loaded (expectedLab) and the write only matches a row whose stored lab
 * values still equal them. A timestamp cannot prove it (two writes can share a
 * millisecond), so the fake clock here is deliberately frozen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  type Lab = {
    labName: string | null;
    labReportReference: string | null;
    samplingDate: Date | null;
    sporeType: string | null;
    sporeCountPreRemediation: number | null;
    outdoorBaselineCount: number | null;
    sporeCountPostRemediation: number | null;
  };
  type Row = Lab & { inspectionId: string; mouldConditionLevel: string | null; updatedAt: Date };
  const store = { row: null as null | Row };
  // Frozen on purpose: every write gets the SAME updatedAt (same millisecond).
  const FROZEN = new Date("2026-11-23T01:00:00.000Z");
  const m = { getServerSession: vi.fn(), assertWrite: vi.fn() };
  const emptyLab: Lab = {
    labName: null,
    labReportReference: null,
    samplingDate: null,
    sporeType: null,
    sporeCountPreRemediation: null,
    outdoorBaselineCount: null,
    sporeCountPostRemediation: null,
  };
  const same = (a: unknown, b: unknown) =>
    a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
  const matches = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      if (k === "inspectionId") return true;
      if (v && typeof v === "object" && !(v instanceof Date) && "gte" in v) {
        const w = v as { gte: Date; lt: Date };
        return r.updatedAt >= w.gte && r.updatedAt < w.lt;
      }
      return same((r as Record<string, unknown>)[k], v);
    });
  const model = {
    findUnique: vi.fn(async () => (store.row ? { ...store.row } : null)),
    findUniqueOrThrow: vi.fn(async () => ({ ...(store.row as Row) })),
    create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
      store.row = { ...emptyLab, mouldConditionLevel: null, inspectionId: "insp_1", ...data, updatedAt: FROZEN } as Row;
      return { ...store.row };
    }),
    // The old route used upsert, which writes unconditionally.
    upsert: vi.fn(async ({ create, update }: { create: Partial<Row>; update: Partial<Row> }) => {
      store.row = store.row
        ? ({ ...store.row, ...update, updatedAt: FROZEN } as Row)
        : ({ ...emptyLab, mouldConditionLevel: null, inspectionId: "insp_1", ...create, updatedAt: FROZEN } as Row);
      return { ...store.row };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      const r = store.row;
      if (!r || !matches(r, where)) return { count: 0 };
      store.row = { ...r, ...data, updatedAt: FROZEN };
      return { count: 1 };
    }),
  };
  const inspectionUpdate = vi.fn(async () => ({}));
  return { store, m, model, inspectionUpdate, emptyLab, FROZEN };
});
const { store, m, inspectionUpdate, emptyLab, FROZEN } = h;

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

const LOADED_OLD = { ...emptyLab, labName: "Old Lab" };

/** A Save as the panel sends it: the form's values plus what the form loaded. */
function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/inspections/insp_1/mould-remediation", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ id: "insp_1" }) },
  );
}
const save = (values: Record<string, unknown>, expectedLab?: Record<string, unknown>) =>
  post({
    ...values,
    // Also sent: the timestamp the form loaded. It proves nothing and the
    // server must not rely on it (it is equal here, as in a same-millisecond race).
    expectedUpdatedAt: FROZEN.toISOString(),
    ...(expectedLab ? { expectedLab } : {}),
  });

function seed(lab: Partial<typeof emptyLab>) {
  store.row = { ...emptyLab, ...lab, mouldConditionLevel: null, inspectionId: "insp_1", updatedAt: FROZEN };
}
/** What the confirm route does to the row. */
function confirmWritesNewLab() {
  store.row = { ...(store.row as NonNullable<typeof store.row>), labName: "New Lab", updatedAt: FROZEN };
}

beforeEach(() => {
  store.row = null;
  vi.clearAllMocks();
  m.getServerSession.mockResolvedValue({ user: { id: "u1" } });
  m.assertWrite.mockResolvedValue({ ok: true, data: { inspectionWhere: { id: "insp_1" } } });
});

describe("mould-remediation POST: stale Save after a confirmed lab fact", () => {
  it("refuses a stale Save even when the confirm shares its updatedAt, and keeps the confirmed value", async () => {
    seed({ labName: "Old Lab" });
    confirmWritesNewLab(); // same millisecond as the version the form loaded
    const res = await save({ labName: "Old Lab" }, LOADED_OLD);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("STALE_ASSESSMENT");
    expect(store.row?.labName).toBe("New Lab");
    expect(inspectionUpdate).not.toHaveBeenCalled();
  });

  it("refuses when a different lab field was confirmed, not only the one the Save edits", async () => {
    seed({ labName: "Old Lab", sporeCountPreRemediation: 100 });
    store.row = { ...(store.row as NonNullable<typeof store.row>), sporeCountPreRemediation: 5200 };
    const res = await save({ mouldConditionLevel: "CONDITION_2" }, { ...LOADED_OLD, sporeCountPreRemediation: 100 });
    expect(res.status).toBe(409);
    expect(store.row?.sporeCountPreRemediation).toBe(5200);
  });

  it("accepts a Save whose loaded lab values still equal the stored ones, even when the row moved for other reasons", async () => {
    seed({ labName: "Old Lab" });
    store.row = { ...(store.row as NonNullable<typeof store.row>), mouldConditionLevel: "CONDITION_1" };
    const res = await save({ labName: "Edited" }, LOADED_OLD);
    expect(res.status).toBe(200);
    expect(store.row?.labName).toBe("Edited");
    expect(inspectionUpdate).toHaveBeenCalledTimes(1);
  });

  it("compares a loaded sampling date and null values exactly", async () => {
    seed({ samplingDate: new Date("2026-09-12T00:00:00.000Z") });
    const ok = await save(
      { labName: "A" },
      { ...emptyLab, samplingDate: "2026-09-12T00:00:00.000Z" },
    );
    expect(ok.status).toBe(200);
    const stale = await save({ labName: "B" }, { ...emptyLab, samplingDate: null });
    expect(stale.status).toBe(409);
    expect(store.row?.labName).toBe("A");
  });

  it("refuses a Save that names no loaded lab values when a record already exists", async () => {
    seed({ labName: "Old Lab" });
    const res = await save({ labName: "Anything" });
    expect(res.status).toBe(409);
    expect(store.row?.labName).toBe("Old Lab");
  });

  it("creates the first record when none exists (the first save is not blocked)", async () => {
    const res = await save({ labName: "First" }, emptyLab);
    expect(res.status).toBe(200);
    expect(store.row?.labName).toBe("First");
  });

  it("refuses a Save from a form that loaded no lab values when a confirm has since written some", async () => {
    seed({ labName: "Confirmed" });
    const res = await save({ labName: "Stale" }, emptyLab);
    expect(res.status).toBe(409);
    expect(store.row?.labName).toBe("Confirmed");
  });
});
