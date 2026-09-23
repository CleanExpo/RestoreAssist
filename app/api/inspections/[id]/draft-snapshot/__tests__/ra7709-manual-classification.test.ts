/**
 * RA-7709: the draft save is where the technician's own Category / Class
 * choice reaches the server. It must be recorded as theirs (one row, with
 * reviewedBy), and clearing the choice must remove it — otherwise submit
 * cannot tell a real choice from a stale water-damage record.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const { resolveInspectionWrite, inspectionFindUnique, transaction, tx, rows } =
  vi.hoisted(() => {
    const rows: Array<Record<string, unknown>> = [];
    const tx = {
      inspection: { update: vi.fn() },
      environmentalData: { deleteMany: vi.fn(), create: vi.fn() },
      moistureReading: { deleteMany: vi.fn(), createMany: vi.fn() },
      affectedArea: { deleteMany: vi.fn(), createMany: vi.fn() },
      scopeItem: { deleteMany: vi.fn(), createMany: vi.fn() },
      waterDamageClassification: { upsert: vi.fn() },
      auditLog: { create: vi.fn() },
      classification: {
        findFirst: vi.fn(
          async ({ where }: { where: { inspectionId: string } }) =>
            rows.filter((r) => r.inspectionId === where.inspectionId).at(-1) ??
            null,
        ),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `c${rows.length + 1}`, ...data };
          rows.push(row);
          return row;
        }),
        update: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const row = rows.find((r) => r.id === where.id)!;
            Object.assign(row, data);
            return row;
          },
        ),
        deleteMany: vi.fn(
          async ({
            where,
          }: {
            where: { inspectionId: string; reviewedBy: { not: null } };
          }) => {
            const keep = rows.filter(
              (r) =>
                !(r.inspectionId === where.inspectionId && r.reviewedBy != null),
            );
            const count = rows.length - keep.length;
            rows.splice(0, rows.length, ...keep);
            return { count };
          },
        ),
      },
    };
    return {
      resolveInspectionWrite: vi.fn(),
      inspectionFindUnique: vi.fn(),
      transaction: vi.fn(),
      tx,
      rows,
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

const basePayload = {
  environmentalData: {
    ambientTemperature: 25,
    humidityLevel: 60,
    dewPoint: 16.7,
    airCirculation: true,
  },
  moistureReadings: [],
  affectedAreas: [],
  scopeItems: [],
};

function put(manualClassification: { category: string; class: string } | null) {
  return PUT(
    new NextRequest("http://localhost/api/inspections/insp_1/draft-snapshot", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...basePayload, manualClassification }),
    }),
    { params: Promise.resolve({ id: "insp_1" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  rows.splice(0, rows.length);
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

describe("RA-7709 draft snapshot — technician classification choice", () => {
  it("records the technician's choice as one row marked as theirs, however often it is saved", async () => {
    expect((await put({ category: "2", class: "3" })).status).toBe(200);
    expect((await put({ category: "2", class: "3" })).status).toBe(200);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      inspectionId: "insp_1",
      category: "2",
      class: "3",
      reviewedBy: "user_1",
    });
  });

  it("clearing the choice removes the technician row so submit auto-classifies", async () => {
    await put({ category: "2", class: "3" });
    expect(rows).toHaveLength(1);

    expect((await put(null)).status).toBe(200);
    expect(rows).toHaveLength(0);
  });
});
