import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  makeTwoWorkspaces,
  project,
} from "@/lib/reports/__tests__/two-workspace-fixture";

// RA-8600: the report PDF route reads the job's AustralianComplianceRecord
// (the "Australian Compliance" form) and hands it to the PDF generator.

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveReportFinancialReach: async () => ({
    ok: true,
    data: { AND: [{ OR: [{ userId: "reach-user" }] }] },
  }),
}));

const reportFindFirst = vi.fn();
const reportFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findFirst: (...a: unknown[]) => reportFindFirst(...a),
      findUnique: (...a: unknown[]) => reportFindUnique(...a),
    },
  },
}));

const generateIICRCReportPDF = vi.fn();
vi.mock("@/lib/generate-iicrc-report-pdf", () => ({
  generateIICRCReportPDF: (...a: unknown[]) => generateIICRCReportPDF(...a),
}));

vi.mock("@/lib/portal-token", () => ({ verifyInsurerToken: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  getClientIp: vi.fn().mockReturnValue("1.2.3.4"),
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_r: unknown, o: { status: number }) =>
    new Response("e", { status: o.status }),
  fromException: () => new Response("e", { status: 500 }),
}));

import { GET } from "../route";

const req = () => new NextRequest("http://localhost/api/reports/r1/pdf");
const ctx = { params: Promise.resolve({ id: "r1" }) };

const STORED_RECORD = {
  insurerName: "Not for the report",
  claimNumber: "Not for the report",
  lossAdjusterName: "Harbour Loss Adjusting",
  lossAdjusterReference: "HLA-77812",
  technicianCertification: "WRT",
  technicianLicenseNumber: "NSW-LIC-40291",
  asbestosRiskAcknowledged: true,
  friableAssessment: "Non-friable ACM eaves lining",
  workHalted: true,
  licensedAssessorName: "Jordan Pike",
  licensedAssessorLicense: "LAA001234",
  removalQuoteAud: "4850.00",
  separateInvoiceRequired: true,
};

type Args = {
  include: {
    user: { select: Record<string, unknown> };
    inspection?: { select?: Record<string, unknown> };
  };
};

// The DB returns only what the route selects: no select, no record.
function serveReport(record: Record<string, unknown> | null) {
  const fixture = makeTwoWorkspaces();
  reportFindUnique.mockImplementation(async (args: Args) => {
    const sel = args.include.inspection?.select?.australianComplianceRecord as
      | { select: Record<string, unknown> }
      | undefined;
    return {
      id: "r1",
      reportNumber: "RPT-1",
      moistureReadings: null,
      psychrometricReadings: null,
      psychrometricAssessment: null,
      equipmentSelection: null,
      scopeAreas: null,
      user: project(fixture.userRow("owner-a"), args.include.user.select),
      client: { name: "Client" },
      inspection: {
        id: "i1",
        claimType: "WATER",
        photos: [],
        claimSketches: [],
        moistureReadings: [],
        roomObservations: [],
        _count: { photos: 0, roomObservations: 0 },
        ...(sel
          ? { australianComplianceRecord: record && project(record, sel.select) }
          : {}),
      },
    };
  });
}

const passed = () =>
  generateIICRCReportPDF.mock.calls[0][0].australianCompliance as
    | Record<string, unknown>
    | null;

beforeEach(() => {
  getServerSession.mockReset();
  reportFindFirst.mockReset();
  reportFindUnique.mockReset();
  generateIICRCReportPDF.mockReset();
  generateIICRCReportPDF.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  getServerSession.mockResolvedValue({ user: { id: "u1" } });
  reportFindFirst.mockResolvedValue({ id: "r1" });
});

describe("GET /api/reports/[id]/pdf - Australian Compliance record (RA-8600)", () => {
  it("reads the record and passes its report fields to the generator", async () => {
    serveReport(STORED_RECORD);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const got = passed();
    expect(got).toMatchObject({
      lossAdjusterName: "Harbour Loss Adjusting",
      lossAdjusterReference: "HLA-77812",
      technicianCertification: "WRT",
      technicianLicenseNumber: "NSW-LIC-40291",
      asbestosRiskAcknowledged: true,
      friableAssessment: "Non-friable ACM eaves lining",
      workHalted: true,
      licensedAssessorName: "Jordan Pike",
      licensedAssessorLicense: "LAA001234",
      removalQuoteAud: "4850.00",
      separateInvoiceRequired: true,
    });
    // RA-8335 owns the duplicated insurer and claim fields; not read here.
    expect(got).not.toHaveProperty("insurerName");
    expect(got).not.toHaveProperty("claimNumber");
  });

  it("passes null when the job has no record", async () => {
    serveReport(null);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(passed()).toBeNull();
  });
});
