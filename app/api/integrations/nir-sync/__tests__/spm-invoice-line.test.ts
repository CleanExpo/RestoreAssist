/**
 * RA-8419 (Codex review round 3, P1): the Senior Project Manager row has no
 * scope item, so a payload built from scope items plus contingency left the
 * $350 out of every accounting invoice while totalExGST still counted it.
 *
 * The NIR sync route must hand the SPM row to the accounting syncs as its own
 * taxed line, so the invoice lines add up to the exported ex-GST total.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getGstTreatment } from "@/lib/gst-rules";
import { SPM_LINE_DESCRIPTION, SPM_LINE_KIND } from "@/lib/billing/spm-line";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/gst/resolve-user-gst", () => ({
  resolveUserGstTreatment: vi.fn(),
}));

const reportFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { report: { findUnique: (...a: unknown[]) => reportFindUnique(...a) } },
}));

const syncAll = vi.fn();
vi.mock("@/lib/integrations/nir-sync-orchestrator", () => ({
  syncNIRToAllConnectedIntegrations: (...a: unknown[]) => syncAll(...a),
  syncNIRToSpecificIntegration: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { resolveUserGstTreatment } from "@/lib/gst/resolve-user-gst";
import { POST } from "../route";

const PRICED = [1200, 900.5, 650];

function report(extraRows: Record<string, unknown>[]) {
  return {
    id: "rep-1",
    userId: "u_1",
    client: null,
    clientName: "Client",
    propertyAddress: "1 Test St",
    reportNumber: "NIR-2026-11-SPM",
    hazardType: "WATER",
    waterCategory: null,
    waterClass: null,
    totalCost: null,
    technicianName: null,
    claimReferenceNumber: null,
    description: null,
    inspectionDate: null,
    createdAt: new Date("2026-11-17"),
    inspection: {
      scopeItems: PRICED.map((_, i) => ({
        id: `scope-${i}`,
        description: `Priced line ${i}`,
        itemType: "LABOUR",
        quantity: 1,
        unit: "each",
        justification: null,
      })),
      costEstimates: [
        ...PRICED.map((amount, i) => ({
          scopeItemId: `scope-${i}`,
          description: `Priced line ${i}`,
          quantity: 1,
          unit: "each",
          rate: amount,
          subtotal: amount,
          contingency: 0,
          total: amount,
          lineKind: null,
        })),
        {
          scopeItemId: null,
          description: "Contingency (10%)",
          quantity: 1,
          unit: "job",
          rate: 275.05,
          subtotal: 0,
          contingency: 275.05,
          total: 275.05,
          lineKind: null,
        },
        ...extraRows,
      ],
      classifications: [],
      inspectionDate: new Date("2026-11-16"),
      technicianName: null,
    },
  };
}

const SPM_ROW = {
  scopeItemId: null,
  description: SPM_LINE_DESCRIPTION,
  quantity: 2,
  unit: "hr",
  rate: 175,
  subtotal: 350,
  contingency: 0,
  total: 350,
  lineKind: SPM_LINE_KIND,
};

type Payload = {
  scopeItems: {
    description: string;
    quantity: number;
    unit: string;
    unitPriceExGST: number;
    subtotalExGST: number;
    gstRate: number;
  }[];
  contingencyExGST?: number;
  totalExGST: number;
};

async function sync(rows: Record<string, unknown>[]): Promise<Payload> {
  reportFindUnique.mockResolvedValue(report(rows));
  const res = await POST(
    new NextRequest("http://localhost/api/integrations/nir-sync", {
      method: "POST",
      body: JSON.stringify({ reportId: "rep-1" }),
    }),
  );
  expect(res.status).toBe(200);
  return syncAll.mock.calls[0][1] as Payload;
}

const lineSum = (p: Payload) =>
  p.scopeItems.reduce((s, i) => s + i.subtotalExGST, 0) +
  (p.contingencyExGST ?? 0);

beforeEach(() => {
  vi.clearAllMocks();
  (getServerSession as any).mockResolvedValue({ user: { id: "u_1" } });
  (resolveUserGstTreatment as any).mockResolvedValue(getGstTreatment("AU"));
  syncAll.mockResolvedValue([]);
});

describe("POST /api/integrations/nir-sync: SPM line on invoices (RA-8419)", () => {
  it("carries the SPM row as its own taxed line of 2 hr at $175", async () => {
    const p = await sync([SPM_ROW]);
    const spm = p.scopeItems.filter(
      (i) => i.description === SPM_LINE_DESCRIPTION,
    );
    expect(spm).toHaveLength(1);
    expect(spm[0]).toMatchObject({
      quantity: 2,
      unit: "hr",
      unitPriceExGST: 17500,
      subtotalExGST: 35000,
      gstRate: 10,
    });
  });

  it("invoice lines add up exactly to totalExGST when an SPM row is saved", async () => {
    const p = await sync([SPM_ROW]);
    // 1200 + 900.50 + 650 + contingency 275.05 + SPM 350 = $3,375.55
    expect(p.totalExGST).toBe(337555);
    expect(lineSum(p)).toBe(p.totalExGST);
  });

  it("no SPM row: no SPM line, and lines still add up", async () => {
    const p = await sync([]);
    expect(
      p.scopeItems.some((i) => i.description === SPM_LINE_DESCRIPTION),
    ).toBe(false);
    expect(lineSum(p)).toBe(p.totalExGST);
  });

  it("a work row worded like the SPM line but without the marker is not added twice", async () => {
    const p = await sync([
      { ...SPM_ROW, lineKind: null, scopeItemId: "scope-0" },
    ]);
    expect(
      p.scopeItems.filter((i) => i.description === SPM_LINE_DESCRIPTION),
    ).toHaveLength(0);
  });
});
