/**
 * RA-8419: the cost-estimates route saves the Senior Project Manager line on
 * a claim over $2,500 ex GST, counts saved rows when appending, and never
 * charges the SPM line twice. The rule itself is tested in
 * lib/__tests__/spm-line.test.ts; this file proves the route applies it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SPM_LINE_DESCRIPTION } from "@/lib/billing/spm-line";

const mockGetServerSession = vi.fn();
const mockFindFirst = vi.fn();
const mockEstimateCosts = vi.fn();
const mockTransaction = vi.fn();
const mockResolveInspectionRates = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => mockGetServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/nir-cost-estimation", () => ({
  estimateCosts: (...a: unknown[]) => mockEstimateCosts(...a),
  resolveInspectionRates: (...a: unknown[]) => mockResolveInspectionRates(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: (...a: unknown[]) => mockFindFirst(...a) },
    costEstimate: { findMany: vi.fn() },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}));
vi.mock("@/lib/pulse/notify-client-change", () => ({
  notifyClientStepChange: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "../route";

/** An engine result whose total ex GST is `total` (no contingency). */
function engineResult(total: number) {
  return {
    items: [
      {
        category: "Labour",
        description: "Water extraction",
        quantity: 1,
        unit: "job",
        rate: total,
        subtotal: total,
        nrpgField: null,
        nrpgCompliant: true,
        rateSource: "company-config",
        isEstimated: true,
      },
    ],
    subtotal: total,
    contingency: 0,
    contingencyPercentage: 0,
    total,
    currency: "AUD",
    breakdown: { equipment: 0, labour: total, materials: 0, other: 0 },
    nrpgCompliant: true,
    nrpgViolations: [],
    pricingSource: "company-config",
  };
}

function inspection(propertyCountry: string | null) {
  return {
    id: "i1",
    status: "SCOPED",
    propertyPostcode: "4000",
    propertyCountry,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    scopeItems: [
      {
        id: "s1",
        itemType: "water_extraction",
        description: "Water extraction",
        quantity: 1,
        unit: "job",
        specification: null,
        justification: null,
      },
    ],
  };
}

/** Run the route; returns the rows it asked the database to create. */
async function post(opts: {
  replace: boolean;
  savedRows?: { description: string; total: number; lineKind: string | null }[];
}) {
  const createMany = vi.fn();
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      $queryRaw: vi.fn().mockResolvedValue([]),
      costEstimate: {
        deleteMany: vi.fn(),
        createMany,
        findMany: vi.fn().mockResolvedValue(opts.savedRows ?? []),
      },
      inspection: { update: vi.fn() },
      auditLog: { create: vi.fn() },
    }),
  );
  const res = await POST(
    new NextRequest("http://localhost:3001/api/inspections/i1/cost-estimates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replace: opts.replace }),
    }),
    { params: Promise.resolve({ id: "i1" }) },
  );
  const rows: { description: string; total: number; lineKind: string | null }[] =
    createMany.mock.calls[0]?.[0]?.data ?? [];
  return { res, rows };
}

const spmRows = (rows: { lineKind: string | null }[]) =>
  rows.filter((r) => r.lineKind === "SPM");

describe("RA-8419 cost-estimates route: SPM line", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockResolveInspectionRates.mockResolvedValue({ ok: true, rates: null });
  });

  it("saves one $350 SPM row on an AU claim over $2,500 and reports the new total", async () => {
    mockFindFirst.mockResolvedValue(inspection("AU"));
    mockEstimateCosts.mockResolvedValue(engineResult(2500.01));
    const { res, rows } = await post({ replace: true });
    expect(res.status).toBe(201);
    expect(spmRows(rows)).toHaveLength(1);
    expect(spmRows(rows)[0].total).toBe(350);
    expect((await res.json()).summary.total).toBe(2850.01);
  });

  it("saves no SPM row at exactly $2,500", async () => {
    mockFindFirst.mockResolvedValue(inspection("AU"));
    mockEstimateCosts.mockResolvedValue(engineResult(2500));
    const { rows } = await post({ replace: true });
    expect(spmRows(rows)).toHaveLength(0);
  });

  it("saves no SPM row for an NZ property", async () => {
    mockFindFirst.mockResolvedValue(inspection("NZ"));
    mockEstimateCosts.mockResolvedValue(engineResult(9000));
    const { rows } = await post({ replace: true });
    expect(spmRows(rows)).toHaveLength(0);
  });

  it("appending: saved rows count towards the threshold", async () => {
    mockFindFirst.mockResolvedValue(inspection("AU"));
    mockEstimateCosts.mockResolvedValue(engineResult(1200));
    const { rows } = await post({
      replace: false,
      savedRows: [{ description: "Earlier work", total: 1500, lineKind: null }],
    });
    expect(spmRows(rows)).toHaveLength(1);
  });

  it("appending: an SPM row already saved is not charged again", async () => {
    mockFindFirst.mockResolvedValue(inspection("AU"));
    mockEstimateCosts.mockResolvedValue(engineResult(4000));
    const { rows } = await post({
      replace: false,
      savedRows: [
        { description: "Earlier work", total: 3000, lineKind: null },
        { description: SPM_LINE_DESCRIPTION, total: 350, lineKind: "SPM" },
      ],
    });
    expect(spmRows(rows)).toHaveLength(0);
  });
});
