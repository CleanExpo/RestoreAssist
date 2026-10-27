import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

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

const signStoredMediaUrl = vi.fn(async (url: string | null | undefined) =>
  url ? `${url}?token=signed` : url,
);
vi.mock("@/lib/storage/sign-stored-url", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/sign-stored-url")>()),
  signStoredMediaUrl: (u: string | null | undefined) => signStoredMediaUrl(u),
}));

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

import sharp from "sharp";
import { GET } from "../route";

const HOST = "https://abc.supabase.co";

// A small valid PNG made by sharp. (The 1x1 base64 PNG used elsewhere fails
// libpng's checks, so the route would rightly drop it as unreadable.)
let smallPng: Uint8Array;
beforeAll(async () => {
  smallPng = new Uint8Array(
    await sharp({ create: { width: 4, height: 3, channels: 3, background: "#808080" } })
      .png()
      .toBuffer(),
  );
});
const png = () => smallPng.slice();

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
    url: `${HOST}/storage/v1/object/public/evidence-optimised/row-org/insp-1/${i}.png`,
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
  vi.unstubAllGlobals();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", HOST);
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

/** The /Filter of every image in the PDF. */
async function imageFilters(response: Response): Promise<string[]> {
  const doc = await PDFDocument.load(new Uint8Array(await response.arrayBuffer()));
  const filters: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (String(obj.dict.get(PDFName.of("Subtype"))) !== "/Image") continue;
    filters.push(String(obj.dict.get(PDFName.of("Filter"))));
  }
  return filters;
}

describe("GET /api/inspections/[id]/report?format=pdf — real PDF bytes", () => {
  it("the returned report has photo grid pages after the report pages", async () => {
    prepareReportPhotos.mockResolvedValue({
      photos: Array.from({ length: 7 }, (_, i) => ({
        bytes: png(),
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

  it("runs the real photo helper through the route's download budget", async () => {
    const actual = await vi.importActual<typeof import("@/lib/reports/inspection-photos-to-images")>(
      "@/lib/reports/inspection-photos-to-images",
    );
    prepareReportPhotos.mockImplementation(actual.prepareReportPhotos);
    const remote = vi.fn(async () => new Response(png(), { status: 200 }));
    vi.stubGlobal("fetch", remote);

    const response = await GET(request(), context);

    expect(remote).toHaveBeenCalledTimes(7);
    expect(signStoredMediaUrl).toHaveBeenCalledTimes(7);
    expect(await pageCount(response)).toBe(1 + 2);
  });

  it("a large PNG is drawn as a JPEG, never decoded to raw pixels by pdf-lib", async () => {
    const png = await sharp({
      create: { width: 2400, height: 1800, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 30 } },
    })
      .png()
      .toBuffer();
    prepareReportPhotos.mockResolvedValue({
      photos: [{ bytes: new Uint8Array(png), isPng: true, caption: "Large PNG" }],
      missing: 0,
      reasons: {},
    });

    const response = await GET(request(), context);

    expect(await imageFilters(response.clone())).toEqual(["/DCTDecode"]);
    expect(await pageCount(response)).toBe(1 + 1);
  });

  it("when no photo can be prepared, the report gains one notice page", async () => {
    prepareReportPhotos.mockRejectedValue(new Error("storage down"));

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(await pageCount(response)).toBe(1 + 1);
  });
});
