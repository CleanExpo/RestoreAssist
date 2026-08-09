import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireClientAuth = vi.fn();
const reportFindFirst = vi.fn();
const generateIICRCReportPDF = vi.fn();

vi.mock("@/lib/portal/require-client-auth", () => ({
  requireClientAuth: (...args: unknown[]) => requireClientAuth(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findFirst: (...args: unknown[]) => reportFindFirst(...args) },
  },
}));
vi.mock("@/lib/generate-iicrc-report-pdf", () => ({
  generateIICRCReportPDF: (...args: unknown[]) =>
    generateIICRCReportPDF(...args),
}));
vi.mock("@/lib/reports/ai-ownership", () => ({
  isAiDraftPending: () => false,
}));
vi.mock("@/lib/clients/brand", () => ({
  resolveOrgBrandTheme: () => ({}),
}));
vi.mock("@/lib/reports/claim-sketch-floors", () => ({
  claimSketchesToFloors: () => Promise.resolve([]),
  uploadedFloorPlanToFloor: () => Promise.resolve(null),
}));
vi.mock("@/lib/reports/append-sketch-pages", () => ({
  appendSketchPages: (pdf: Uint8Array) => Promise.resolve(pdf),
}));
vi.mock("@/lib/reports/inspection-photos-to-images", () => ({
  inspectionPhotosToImages: () => Promise.resolve([]),
}));
vi.mock("@/lib/reports/append-photo-pages", () => ({
  appendPhotoPages: (pdf: Uint8Array) => Promise.resolve(pdf),
}));

import { GET } from "../route";

const request = () =>
  new NextRequest("http://localhost/api/portal/reports/report_1/download", {
    method: "GET",
  });
const context = { params: Promise.resolve({ id: "report_1" }) };

function report(overrides: Record<string, unknown> = {}) {
  return {
    id: "report_1",
    status: "COMPLETED",
    reportNumber: "R-1",
    propertyAddress: "1 Test Street",
    inspectionPdfUrl: null,
    detailedReport: "Final report",
    scopeOfWorksDocument: null,
    costEstimationDocument: null,
    moistureReadings: null,
    psychrometricReadings: null,
    psychrometricAssessment: null,
    equipmentSelection: null,
    scopeAreas: null,
    user: { organization: null },
    client: { name: "Client" },
    inspection: { floorPlanImageUrl: null, claimSketches: [], photos: [] },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireClientAuth.mockResolvedValue({
    ok: true,
    claims: { clientId: "client_1" },
  });
  generateIICRCReportPDF.mockResolvedValue(
    new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  );
});

describe("GET /api/portal/reports/[id]/download", () => {
  it.each([
    ["draft", { status: "DRAFT" }],
    [
      "documentless",
      {
        inspectionPdfUrl: null,
        detailedReport: null,
        scopeOfWorksDocument: null,
        costEstimationDocument: null,
      },
    ],
  ])("does not generate a PDF for a %s report", async (_label, overrides) => {
    reportFindFirst.mockResolvedValueOnce(report(overrides));

    const response = await GET(request(), context);

    expect(response.status).toBe(404);
    expect(generateIICRCReportPDF).not.toHaveBeenCalled();
  });

  it("downloads only the client-bound published report", async () => {
    reportFindFirst.mockResolvedValueOnce(report());

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(generateIICRCReportPDF).toHaveBeenCalledTimes(1);
    expect(reportFindFirst.mock.calls[0][0].where).toMatchObject({
      id: "report_1",
      clientId: "client_1",
      status: "COMPLETED",
    });
  });
});
