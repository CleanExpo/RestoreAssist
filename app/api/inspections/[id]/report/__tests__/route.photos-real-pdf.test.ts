import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";

// Real pdf-lib and the real appendPhotoPages: this file proves the bytes the
// route returns gain photo pages, which the wiring test cannot.

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const inspectionFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: (...args: unknown[]) => inspectionFindFirst(...args),
    },
  },
}));

const generateNIRPDF = vi.fn();
vi.mock("@/lib/nir-report-generation", () => ({
  generateNIRPDF: (...args: unknown[]) => generateNIRPDF(...args),
}));

vi.mock("@/lib/reports/claim-sketch-floors", () => ({
  claimSketchesToFloors: vi.fn().mockResolvedValue([]),
}));

const prepareReportPhotos = vi.fn();
vi.mock("@/lib/reports/inspection-photos-to-images", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reports/inspection-photos-to-images")>()),
  prepareReportPhotos: (...args: unknown[]) => prepareReportPhotos(...args),
}));

vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

vi.mock("@/lib/api-errors", () => ({
  apiError: (_request: unknown, options: { status: number; message: string }) =>
    Response.json({ error: options.message }, { status: options.status }),
  fromException: () =>
    Response.json({ error: "Internal server error" }, { status: 500 }),
}));

vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionReadable: vi.fn().mockResolvedValue({ ok: true }),
  resolveInspectionFinancialReach: vi
    .fn()
    .mockResolvedValue({ ok: true, data: {} }),
}));

import { GET } from "../route";

const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function bytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const request = () =>
  new NextRequest("http://localhost/api/inspections/insp-1/report?format=pdf");
const context = { params: Promise.resolve({ id: "insp-1" }) };

const inspection = {
  id: "insp-1",
  inspectionNumber: "NIR-1",
  propertyAddress: "1 Test Street",
  propertyPostcode: "4000",
  inspectionDate: new Date("2026-08-09T00:00:00Z"),
  completedAt: new Date("2026-08-09T01:00:00Z"),
  updatedAt: new Date("2026-08-09T01:00:00Z"),
  technicianName: "Test Technician",
  status: "COMPLETED",
  environmentalData: null,
  moistureReadings: [],
  affectedAreas: [],
  scopeItems: [],
  classifications: [],
  costEstimates: [],
  photos: [],
  claimSketches: [],
  floorPlanImageUrl: null,
  report: null,
};

const photoRow = {
  userId: "owner-user",
  workspaceId: "row-ws",
  user: { organizationId: "row-org" },
  _count: { photos: 7 },
  photos: Array.from({ length: 7 }, (_, i) => ({
    id: `photo-${i}`,
    inspectionId: "insp-1",
    url: `https://store.example/row-org/insp-1/${i}.png`,
    thumbnailUrl: null,
    description: null,
    location: null,
    roomType: null,
    mimeType: "image/png",
  })),
};

async function onePagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return doc.save();
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "session-user" } });
  inspectionFindFirst.mockImplementation(async (args: { select?: Record<string, unknown> }) => {
    if (args?.select && "photos" in args.select) return photoRow;
    if (args?.select && "id" in args.select) return { id: "insp-1" };
    return inspection;
  });
  generateNIRPDF.mockImplementation(onePagePdf);
});

async function pageCount(response: Response): Promise<number> {
  const doc = await PDFDocument.load(new Uint8Array(await response.arrayBuffer()));
  return doc.getPageCount();
}

describe("GET /api/inspections/[id]/report?format=pdf — real PDF bytes", () => {
  it("the returned report has photo grid pages after the report pages", async () => {
    prepareReportPhotos.mockResolvedValue({
      photos: Array.from({ length: 7 }, (_, i) => ({
        bytes: bytes(PNG_1x1),
        isPng: true,
        caption: `Photo ${i}`,
      })),
      missing: 0,
      reasons: {},
    });

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(await pageCount(response)).toBe(1 + 2); // 7 photos, 6 per grid page
  });

  it("when no photo can be prepared, the report gains one notice page", async () => {
    prepareReportPhotos.mockRejectedValue(new Error("storage down"));

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(await pageCount(response)).toBe(1 + 1);
  });
});
