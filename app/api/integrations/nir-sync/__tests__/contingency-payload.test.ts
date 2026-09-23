/**
 * RA-7736: the NIR sync route must hand the contingency to the accounting
 * syncs. The contingency CostEstimate row has no scope item (RA-7708), so a
 * payload built from scope items alone never carried it.
 *
 * Totals are RA-7725's scope and are deliberately not asserted here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getGstTreatment } from "@/lib/gst-rules";

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

const PRICED = [325, 175, 225, 484, 1050];

function report() {
  return {
    id: "rep-1",
    userId: "u_1",
    client: null,
    clientName: "Client",
    propertyAddress: "1 Test St",
    reportNumber: "NIR-2026-09-F1C142",
    hazardType: "WATER",
    waterCategory: null,
    waterClass: null,
    totalCost: null,
    technicianName: null,
    claimReferenceNumber: null,
    description: null,
    inspectionDate: null,
    createdAt: new Date("2026-09-23"),
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
          rate: amount,
          subtotal: amount,
          contingency: 0,
          total: amount,
        })),
        {
          scopeItemId: null,
          rate: 271.08,
          subtotal: 0,
          contingency: 271.08,
          total: 271.08,
        },
      ],
      classifications: [],
      inspectionDate: new Date("2026-09-22"),
      technicianName: null,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (getServerSession as any).mockResolvedValue({ user: { id: "u_1" } });
  (resolveUserGstTreatment as any).mockResolvedValue(getGstTreatment("AU"));
  reportFindUnique.mockResolvedValue(report());
  syncAll.mockResolvedValue([]);
});

describe("POST /api/integrations/nir-sync contingency (RA-7736)", () => {
  it("passes the contingency amount, in cents, to the accounting syncs", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/integrations/nir-sync", {
        method: "POST",
        body: JSON.stringify({ reportId: "rep-1" }),
      }),
    );
    expect(res.status).toBe(200);
    const payload = syncAll.mock.calls[0][1] as { contingencyExGST?: number };
    expect(payload.contingencyExGST).toBe(27108);
  });
});
