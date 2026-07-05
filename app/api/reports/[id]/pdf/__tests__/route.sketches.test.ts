import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";

// PR2 (RA-120) — the canonical IICRC report embeds each floor's sketch
// (underlay + annotations) as its own page, sourced from ClaimSketch.renderedPngUrl.

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

// claim-sketch-floors + append-sketch-pages are NOT mocked — the test exercises
// the real embed pipeline end-to-end (real pdf-lib, real PNG).
import { GET } from "../route";

const PNG_1x1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function pngBytes(): Uint8Array {
  const binary = atob(PNG_1x1_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
  const doc = await PDFDocument.load(buf);
  return doc.getPageCount();
}

beforeEach(async () => {
  getServerSession.mockReset();
  reportFindFirst.mockReset();
  reportFindUnique.mockReset();
  generateIICRCReportPDF.mockReset();

  // A real 1-page base report so pdf-lib can re-open and append to it.
  const base = await PDFDocument.create();
  base.addPage([200, 200]);
  generateIICRCReportPDF.mockResolvedValue(await base.save());

  getServerSession.mockResolvedValue({ user: { id: "u1" } });
  reportFindFirst.mockResolvedValue({ id: "r1" }); // ownership

  // Stub global fetch used by claimSketchesToFloors to pull the rendered PNG.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => pngBytes().buffer,
    })),
  );
});

describe("GET /api/reports/[id]/pdf — floor plan embedding", () => {
  it("adds one PDF page per floor that has a rendered sketch", async () => {
    reportFindUnique.mockResolvedValueOnce(
      reportBase({
        claimSketches: [
          {
            floorNumber: 0,
            floorLabel: "Ground Floor",
            renderedPngUrl: "https://x/0.png",
            sketchData: null,
          },
          {
            floorNumber: 1,
            floorLabel: "Level 1",
            renderedPngUrl: "https://x/1.png",
            sketchData: null,
          },
        ],
      }),
    );

    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(await pageCountOf(res)).toBe(3); // 1 base + 2 floors
  });

  it("leaves the report unchanged when no sketch has been rendered", async () => {
    reportFindUnique.mockResolvedValueOnce(
      reportBase({
        claimSketches: [
          {
            floorNumber: 0,
            floorLabel: "Ground Floor",
            renderedPngUrl: null,
            sketchData: null,
          },
        ],
      }),
    );

    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(await pageCountOf(res)).toBe(1); // base only
  });

  it("handles reports with no inspection", async () => {
    reportFindUnique.mockResolvedValueOnce(reportBase(null));
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(await pageCountOf(res)).toBe(1);
  });

  // RA-120 §3 — the moisture map must be included alongside the structural
  // sketch. The pins live on ClaimSketch.moisturePoints (a DOM overlay never
  // baked into renderedPngUrl), so the report must query them and overlay them.
  it("queries moisturePoints for each floor sketch", async () => {
    reportFindUnique.mockResolvedValueOnce(reportBase({ claimSketches: [] }));
    await GET(req(), ctx);

    const arg = reportFindUnique.mock.calls[0][0];
    expect(
      arg.include.inspection.select.claimSketches.select.moisturePoints,
    ).toBe(true);
  });

  it("renders a floor carrying moisture pins without failing the download", async () => {
    reportFindUnique.mockResolvedValueOnce(
      reportBase({
        claimSketches: [
          {
            floorNumber: 0,
            floorLabel: "Ground Floor",
            renderedPngUrl: "https://x/0.png",
            sketchData: null,
            moisturePoints: [
              { nx: 0.25, ny: 0.5, wme: 12 },
              { nx: 0.75, ny: 0.3, wme: 42 },
            ],
          },
        ],
      }),
    );

    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    // Base report page + the one floor page (with the moisture overlay drawn).
    expect(await pageCountOf(res)).toBe(2);
  });
});
