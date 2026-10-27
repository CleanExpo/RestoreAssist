import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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

const claimSketchesToFloors = vi.fn();
vi.mock("@/lib/reports/claim-sketch-floors", () => ({
  claimSketchesToFloors: (...args: unknown[]) => claimSketchesToFloors(...args),
}));

const appendSketchPages = vi.fn();
vi.mock("@/lib/reports/append-sketch-pages", () => ({
  appendSketchPages: (...args: unknown[]) => appendSketchPages(...args),
}));

// The photo pipeline itself (signing, folder binding, per-photo limits) has its
// own tests. Here only prepareReportPhotos is replaced; photoOwnerFolders stays real.
const prepareReportPhotos = vi.fn();
vi.mock("@/lib/reports/inspection-photos-to-images", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reports/inspection-photos-to-images")>()),
  prepareReportPhotos: (...args: unknown[]) => prepareReportPhotos(...args),
}));

const appendPhotoPages = vi.fn();
vi.mock("@/lib/reports/append-photo-pages", () => ({
  appendPhotoPages: (...args: unknown[]) => appendPhotoPages(...args),
}));

const reportError = vi.fn();
vi.mock("@/lib/observability", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

vi.mock("@/lib/security/safe-external-url", () => ({
  isSafePublicHttpsUrl: vi.fn().mockResolvedValue(true),
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

import { assertInspectionReadable } from "@/lib/auth/assert-tenancy";
import { GET } from "../route";

const request = (format = "pdf") =>
  new NextRequest(`http://localhost/api/inspections/insp-1/report?format=${format}`);
const context = { params: Promise.resolve({ id: "insp-1" }) };

const BASE = new Uint8Array([1, 1, 1]);
const SKETCHED = new Uint8Array([2, 2, 2]);
const REBUILT = new Uint8Array([5, 5, 5]);
const WITH_PHOTOS = new Uint8Array([3, 3, 3]);
const NOTICE = new Uint8Array([4, 4, 4]);

// Distinct values so a field read from the wrong place cannot pass.
const ROW = { userId: "owner-user", workspaceId: "row-ws", organizationId: "row-org" };
const TOTAL = 650;

const photoRow = (n: number) => ({
  id: `photo-${n}`,
  inspectionId: "insp-1",
  url: `https://store.example/row-org/insp-1/${n}.jpg`,
  thumbnailUrl: null,
  description: `Photo ${n}`,
  location: "Kitchen",
  roomType: "kitchen",
  mimeType: "image/jpeg",
});
const PHOTO_ROWS = [photoRow(1), photoRow(2), photoRow(3)];

const PHOTO_SELECT = {
  userId: true,
  workspaceId: true,
  user: { select: { organizationId: true } },
  _count: { select: { photos: true } },
  photos: {
    select: {
      id: true,
      inspectionId: true,
      url: true,
      thumbnailUrl: true,
      description: true,
      location: true,
      roomType: true,
      mimeType: true,
    },
    orderBy: { timestamp: "asc" },
    take: 500,
  },
};

function inspection(overrides: Record<string, unknown> = {}) {
  return {
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
    claimSketches: [
      {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        renderedPngUrl: "https://cdn.example.com/ground.png",
        sketchData: null,
        moisturePoints: null,
      },
    ],
    floorPlanImageUrl: null,
    report: null,
    ...overrides,
  };
}

const floor = {
  label: "Ground Floor",
  pngDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
  fabricJson: null,
  moisturePins: [],
};

type Args = { select?: Record<string, unknown> };
const isPhotoQuery = (args: Args) => Boolean(args?.select && "photos" in args.select);

/** Answers only the fields a select asks for, so a missing field arrives as undefined. */
function answerPhotoQuery(args: Args) {
  const full: Record<string, unknown> = {
    userId: ROW.userId,
    workspaceId: ROW.workspaceId,
    user: { organizationId: ROW.organizationId },
    _count: { photos: TOTAL },
    photos: PHOTO_ROWS,
  };
  return Object.fromEntries(Object.keys(args.select ?? {}).map((k) => [k, full[k]]));
}

let photoQuery: (args: Args) => unknown;

beforeEach(() => {
  vi.clearAllMocks();
  photoQuery = answerPhotoQuery;
  getServerSession.mockResolvedValue({
    user: { id: "session-user", organizationId: "session-org" },
  });
  inspectionFindFirst.mockImplementation(async (args: Args) => {
    if (isPhotoQuery(args)) return photoQuery(args);
    if (args?.select && "id" in args.select) return { id: "insp-1" };
    return inspection();
  });
  generateNIRPDF.mockResolvedValue(BASE);
  claimSketchesToFloors.mockResolvedValue([floor]);
  appendSketchPages.mockResolvedValue(SKETCHED);
  prepareReportPhotos.mockResolvedValue({
    photos: [{ caption: "a" }, { caption: "b" }, { caption: "c" }],
    missing: 0,
    reasons: {},
  });
  appendPhotoPages.mockImplementation(async (bytes: Uint8Array, photos: unknown[]) =>
    photos.length ? WITH_PHOTOS : NOTICE,
  );
});

// The route admits one photo stage per process and holds it until that
// stage's work settles. A test that leaves prepareReportPhotos hanging must
// settle it afterwards, or every later test would find the stage busy.
const hanging: Array<() => void> = [];
function hang() {
  return new Promise((resolve) => {
    hanging.push(() => resolve({ photos: [], missing: 0, reasons: {} }));
  });
}

afterEach(async () => {
  vi.useRealTimers();
  hanging.splice(0).forEach((settle) => settle());
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
});

async function body(response: Response) {
  return new Uint8Array(await response.arrayBuffer());
}

const dropReasons = () =>
  reportError.mock.calls.map((c) => (c[1] as { reason?: string }).reason);

describe("GET /api/inspections/[id]/report?format=pdf — photo pages (O-1)", () => {
  it("embeds this inspection's photos on the sketch-final report and logs nothing", async () => {
    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(prepareReportPhotos).toHaveBeenCalledTimes(1);
    const [rows, options] = prepareReportPhotos.mock.calls[0];
    expect(rows).toEqual(PHOTO_ROWS);
    expect(options).toMatchObject({ inspectionId: "insp-1", totalCount: TOTAL });
    expect(typeof options.fetchImpl).toBe("function");
    expect(appendPhotoPages).toHaveBeenCalledTimes(1);
    expect(appendPhotoPages.mock.calls[0][0]).toEqual(SKETCHED);
    expect(appendPhotoPages.mock.calls[0][1]).toHaveLength(3);
    expect(appendPhotoPages.mock.calls[0][2]).toMatchObject({
      reportNumber: "NIR-1",
      propertyAddress: "1 Test Street",
      missingCount: 0,
    });
    expect(await body(response)).toEqual(WITH_PHOTOS);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("binds signing to the inspection row's owner folders, never the session's", async () => {
    await GET(request(), context);

    expect(prepareReportPhotos.mock.calls[0][1].ownerFolders).toEqual([
      "row-org",
      "row-ws",
      "owner-user",
      "no-org",
    ]);
  });

  it("reads photo rows by the route id with the exact select", async () => {
    await GET(request(), context);

    const query = inspectionFindFirst.mock.calls.map((c) => c[0]).find(isPhotoQuery);
    expect(query.where).toEqual({ id: "insp-1" });
    expect(query.select).toEqual(PHOTO_SELECT);
  });

  it("appends photos after the floor-plan rebuild, to the rebuilt bytes", async () => {
    generateNIRPDF.mockResolvedValueOnce(BASE).mockResolvedValueOnce(REBUILT);
    appendSketchPages
      .mockRejectedValueOnce(new Error("invalid image"))
      .mockImplementationOnce(async (bytes: Uint8Array) => bytes);

    await GET(request(), context);

    expect(generateNIRPDF).toHaveBeenCalledTimes(2);
    expect(appendPhotoPages.mock.calls[0][0]).toEqual(REBUILT);
  });

  it("passes the pipeline's missing count to the photo pages", async () => {
    prepareReportPhotos.mockResolvedValue({ photos: [{ caption: "a" }], missing: 649, reasons: {} });

    await GET(request(), context);

    expect(appendPhotoPages.mock.calls[0][2]).toMatchObject({ missingCount: 649 });
  });

  it("an inspection with no photos returns the sketch-final bytes untouched", async () => {
    photoQuery = (args) => ({ ...answerPhotoQuery(args), _count: { photos: 0 }, photos: [] });

    const response = await GET(request(), context);

    expect(await body(response)).toEqual(SKETCHED);
    expect(prepareReportPhotos).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("stops waiting for photos at the 25 s deadline and returns the notice report", async () => {
    vi.useFakeTimers();
    // A download that only ends when its signal aborts.
    const remote = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    vi.stubGlobal("fetch", remote);
    let fetchImpl: typeof fetch | undefined;
    let inFlight: Promise<Response> | undefined;
    prepareReportPhotos.mockImplementation((_rows: unknown, options: { fetchImpl: typeof fetch }) => {
      fetchImpl = options.fetchImpl;
      inFlight = options.fetchImpl("https://store.example/slow.jpg");
      inFlight.catch(() => {});
      return hang();
    });

    const pending = GET(request(), context);
    await vi.advanceTimersByTimeAsync(24_999);
    expect(appendPhotoPages).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(appendPhotoPages).toHaveBeenLastCalledWith(SKETCHED, [], expect.objectContaining({ missingCount: TOTAL }));
    expect(await body(response)).toEqual(NOTICE);
    expect(dropReasons()).toEqual(["deadline"]);
    expect(reportError.mock.calls[0][1]).toMatchObject({
      stage: "inspection:report:photos-dropped",
      inspectionId: "insp-1",
      photoCount: TOTAL,
    });
    // The download in flight at the deadline is aborted, and later ones are
    // refused without reaching the network.
    await expect(inFlight).rejects.toThrow("aborted");
    const after = await fetchImpl!("https://store.example/late.jpg");
    expect(after.ok).toBe(false);
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it("runs one photo stage at a time; a request still waiting at its deadline gets the notice", async () => {
    vi.useFakeTimers();
    prepareReportPhotos.mockImplementation(() => hang());

    const first = GET(request(), context);
    await vi.advanceTimersByTimeAsync(10_000);
    const second = GET(request(), context);
    await vi.advanceTimersByTimeAsync(15_000); // first reaches its deadline
    await vi.advanceTimersByTimeAsync(10_000); // second reaches its deadline
    const responses = await Promise.all([first, second]);

    expect(prepareReportPhotos).toHaveBeenCalledTimes(1);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(await body(responses[1])).toEqual(NOTICE);
    expect(dropReasons()).toEqual(["deadline", "busy"]);

    // Once the held stage's work settles, the next request runs its photos.
    vi.useRealTimers();
    hanging.splice(0).forEach((settle) => settle());
    await new Promise((resolve) => setTimeout(resolve, 0));
    prepareReportPhotos.mockResolvedValue({ photos: [{ caption: "a" }], missing: 0, reasons: {} });
    const third = await GET(request(), context);
    expect(await body(third)).toEqual(WITH_PHOTOS);
  });

  it("stops downloading at 40 MB, keeps the photos already received and logs the trip", async () => {
    const twentyFiveMb = () => new Response(new Uint8Array(25 * 1024 * 1024), { status: 200 });
    const remote = vi.fn(async () => twentyFiveMb());
    vi.stubGlobal("fetch", remote);
    let seen: boolean[] = [];
    prepareReportPhotos.mockImplementation(async (_rows: unknown, options: { fetchImpl: typeof fetch }) => {
      for (const n of [1, 2, 3]) {
        const res = await options.fetchImpl(`https://store.example/${n}.jpg`);
        seen.push(res.ok);
        if (res.ok) expect((await res.arrayBuffer()).byteLength).toBe(25 * 1024 * 1024);
      }
      return { photos: [{ caption: "a" }], missing: TOTAL - 1, reasons: {} };
    });

    const response = await GET(request(), context);

    expect(seen).toEqual([true, false, false]);
    expect(remote).toHaveBeenCalledTimes(2);
    expect(await body(response)).toEqual(WITH_PHOTOS);
    expect(appendPhotoPages.mock.calls[0][2]).toMatchObject({ missingCount: TOTAL - 1 });
    expect(dropReasons()).toEqual(["fetch_budget"]);

    // The budget belongs to one request: the next report starts from zero.
    seen = [];
    await GET(request(), context);
    expect(seen).toEqual([true, false, false]);
    expect(remote).toHaveBeenCalledTimes(4);
  });

  it("a photo report over 60 MB falls back to the notice report, never a 413", async () => {
    const huge = new Uint8Array(60 * 1024 * 1024 + 1);
    appendPhotoPages.mockImplementation(async (_b: Uint8Array, photos: unknown[]) =>
      photos.length ? huge : NOTICE,
    );

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(appendPhotoPages).toHaveBeenLastCalledWith(SKETCHED, [], expect.objectContaining({ missingCount: TOTAL }));
    expect(await body(response)).toEqual(NOTICE);
    expect(dropReasons()).toEqual(["over_size"]);
    expect(reportError.mock.calls[0][1]).toMatchObject({ pdfBytes: huge.length });
  });

  it("a photo report of exactly 60 MB is kept", async () => {
    const exact = new Uint8Array(60 * 1024 * 1024);
    appendPhotoPages.mockImplementation(async (_b: Uint8Array, photos: unknown[]) =>
      photos.length ? exact : NOTICE,
    );

    const response = await GET(request(), context);

    expect((await body(response)).length).toBe(exact.length);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("a failed photo query returns the sketch-final report and logs it", async () => {
    photoQuery = () => {
      throw new Error("pool timeout");
    };

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual(SKETCHED);
    expect(appendPhotoPages).not.toHaveBeenCalled();
    expect(dropReasons()).toEqual(["query_failed"]);
  });

  it("a failure preparing photos returns the notice report counting every photo", async () => {
    prepareReportPhotos.mockRejectedValue(new Error("storage down"));

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(appendPhotoPages).toHaveBeenLastCalledWith(SKETCHED, [], expect.objectContaining({ missingCount: TOTAL }));
    expect(await body(response)).toEqual(NOTICE);
    expect(dropReasons()).toEqual(["prepare_failed"]);
  });

  it("a failure drawing the photo pages returns the notice report", async () => {
    appendPhotoPages.mockImplementation(async (_b: Uint8Array, photos: unknown[]) => {
      if (photos.length) throw new Error("pdf-lib load failed");
      return NOTICE;
    });

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual(NOTICE);
    expect(dropReasons()).toEqual(["append_failed"]);
  });

  it("if the notice page also fails, the sketch-final report is still returned", async () => {
    prepareReportPhotos.mockRejectedValue(new Error("storage down"));
    appendPhotoPages.mockRejectedValue(new Error("pdf-lib load failed"));

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual(SKETCHED);
    expect(dropReasons()).toEqual(["prepare_failed", "notice_failed"]);
  });

  it("a caller who cannot read the inspection gets 404 and no photo work", async () => {
    vi.mocked(assertInspectionReadable).mockResolvedValueOnce({ ok: false } as never);

    const response = await GET(request(), context);

    expect(response.status).toBe(404);
    expect(inspectionFindFirst.mock.calls.some((c) => isPhotoQuery(c[0]))).toBe(false);
    expect(prepareReportPhotos).not.toHaveBeenCalled();
  });

  it.each(["json", "excel"])("the %s format does no photo-page work", async (format) => {
    await GET(request(format), context);

    expect(inspectionFindFirst.mock.calls.some((c) => isPhotoQuery(c[0]))).toBe(false);
    expect(prepareReportPhotos).not.toHaveBeenCalled();
    expect(appendPhotoPages).not.toHaveBeenCalled();
  });
});
