import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";

// PR3 (RA-120) — the canonical IICRC report appends inspection photos as a
// captioned grid, sourced from inspection.photos.

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

// Real photo pipeline (no mock on inspection-photos-to-images / append-photo-pages).
import { GET } from "../route";

const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function pngBytes(): Uint8Array {
  const bin = atob(PNG_1x1);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const req = () => new NextRequest("http://localhost/api/reports/r1/pdf");
const ctx = { params: Promise.resolve({ id: "r1" }) };

function reportBase(inspection: unknown) {
  return {
    id: "r1",
    reportNumber: "RPT-1",
    propertyAddress: "1 Test St",
    moistureReadings: null,
    psychrometricReadings: null,
    psychrometricAssessment: null,
    equipmentSelection: null,
    scopeAreas: null,
    user: { name: "Tech", businessName: "Acme", organization: null },
    client: { name: "Client" },
    inspection,
  };
}

async function pageCountOf(res: Response): Promise<number> {
  const buf = new Uint8Array(await res.arrayBuffer());
  return (await PDFDocument.load(buf)).getPageCount();
}

beforeEach(async () => {
  getServerSession.mockReset();
  reportFindFirst.mockReset();
  reportFindUnique.mockReset();
  generateIICRCReportPDF.mockReset();

  const base = await PDFDocument.create();
  base.addPage([595, 842]);
  generateIICRCReportPDF.mockResolvedValue(await base.save());

  getServerSession.mockResolvedValue({ user: { id: "u1" } });
  reportFindFirst.mockResolvedValue({ id: "r1" });

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => pngBytes().buffer })),
  );
});

describe("GET /api/reports/[id]/pdf — photo embedding", () => {
  it("appends a grid page when the inspection has photos", async () => {
    reportFindUnique.mockResolvedValueOnce(
      reportBase({
        claimSketches: [],
        photos: [
          { url: "https://x/1.png", mimeType: "image/png", description: "Kitchen" },
          { url: "https://x/2.png", mimeType: "image/png", description: "Bathroom" },
        ],
      }),
    );

    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(await pageCountOf(res)).toBe(2); // 1 base + 1 photo grid page
  });

  it("leaves the report unchanged when there are no photos", async () => {
    reportFindUnique.mockResolvedValueOnce(
      reportBase({ claimSketches: [], photos: [] }),
    );

    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(await pageCountOf(res)).toBe(1);
  });
});
