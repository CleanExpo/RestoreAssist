import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// PR1 — the IICRC report must be branded with the contractor's own firm
// identity (logo + accent) from their Organization, not hardcoded RestoreAssist.

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

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

// NB: lib/clients/brand is NOT mocked — the test exercises the real resolver.
import { GET } from "../route";

const req = () => new NextRequest("http://localhost/api/reports/r1/pdf");
const ctx = { params: Promise.resolve({ id: "r1" }) };

function reportWithOrg(org: unknown) {
  return {
    id: "r1",
    reportNumber: "RPT-1",
    moistureReadings: null,
    psychrometricReadings: null,
    psychrometricAssessment: null,
    equipmentSelection: null,
    scopeAreas: null,
    user: { name: "Tech", businessName: "Acme Restoration", organization: org },
    client: { name: "Client" },
  };
}

beforeEach(() => {
  getServerSession.mockReset();
  reportFindFirst.mockReset();
  reportFindUnique.mockReset();
  generateIICRCReportPDF.mockReset();
  generateIICRCReportPDF.mockResolvedValue(new Uint8Array([37, 80, 68, 70])); // %PDF
  getServerSession.mockResolvedValue({ user: { id: "u1" } });
  reportFindFirst.mockResolvedValue({ id: "r1" }); // ownership
});

describe("GET /api/reports/[id]/pdf — firm branding", () => {
  it("returns 401 when not authorised", async () => {
    getServerSession.mockResolvedValueOnce(null);
    reportFindFirst.mockResolvedValueOnce(null);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(401);
  });

  it("passes the firm's org logo + colour as the report theme", async () => {
    reportFindUnique.mockResolvedValueOnce(
      reportWithOrg({
        logoUrl: "https://res.cloudinary.com/x/acme.png",
        primaryColor: "#0EA5E9",
      }),
    );
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(generateIICRCReportPDF.mock.calls[0][1]).toEqual({
      theme: {
        logoUrl: "https://res.cloudinary.com/x/acme.png",
        primaryColor: "#0EA5E9",
      },
    });
  });

  it("falls back to RA defaults when the org has no branding", async () => {
    reportFindUnique.mockResolvedValueOnce(reportWithOrg(null));
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const theme = generateIICRCReportPDF.mock.calls[0][1].theme;
    expect(theme.primaryColor).toBe("#1C2E47"); // RA navy default
    expect(theme.logoUrl).toBe(""); // text-only header
  });
});
