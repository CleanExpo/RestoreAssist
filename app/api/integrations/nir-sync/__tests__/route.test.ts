/**
 * RA-7725: the accounting sync must not book the contingency as GST.
 *
 * Since RA-7708 the contingency is one CostEstimate row with subtotal 0 and
 * the amount in `contingency` and `total`. Treating Σsubtotal as ex-GST and
 * Σtotal as inc-GST made the difference (the contingency) the "GST".
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
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

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockGst = resolveUserGstTreatment as unknown as ReturnType<typeof vi.fn>;

// NIR-2026-09-F1C142 shape: five priced lines (2259.00) + one contingency row.
const PRICED = [325, 175, 225, 484, 1050];
const costEstimates = [
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
];

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
      scopeItems: [],
      costEstimates,
      classifications: [],
      inspectionDate: new Date("2026-09-22"),
      technicianName: null,
    },
  };
}

function post() {
  return new NextRequest("http://localhost/api/integrations/nir-sync", {
    method: "POST",
    body: JSON.stringify({ reportId: "rep-1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  reportFindUnique.mockResolvedValue(report());
  syncAll.mockResolvedValue([]);
});

describe("POST /api/integrations/nir-sync totals (RA-7725)", () => {
  it.each([
    // ex-GST base = 2259.00 + 271.08 = 2530.08; GST per lib/gst-rules.ts.
    ["AU" as const, 253008, 25301, 278309],
    ["NZ" as const, 253008, 37951, 290959],
  ])(
    "%s: contingency is in the ex-GST base and is never counted as GST",
    async (country, exGst, gst, incGst) => {
      mockGst.mockResolvedValue(getGstTreatment(country));

      const res = await POST(post());
      expect(res.status).toBe(200);

      const payload = syncAll.mock.calls[0][1] as {
        totalExGST: number;
        gstAmount: number;
        totalIncGST: number;
      };
      expect(payload.gstAmount).not.toBe(27108);
      expect(payload.totalExGST).toBe(exGst);
      expect(payload.gstAmount).toBe(gst);
      expect(payload.totalIncGST).toBe(incGst);
    },
  );
});
