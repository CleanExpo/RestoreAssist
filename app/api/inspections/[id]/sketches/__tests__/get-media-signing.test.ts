import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const assertInspectionTenancy = vi.hoisted(() => vi.fn());
const claimSketchFindMany = vi.hoisted(() => vi.fn());
const claimSketchUpdate = vi.hoisted(() => vi.fn());
const signStoredMediaUrl = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({ assertInspectionTenancy }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    claimSketch: {
      findMany: claimSketchFindMany,
      update: claimSketchUpdate,
    },
  },
}));
vi.mock("@/lib/storage/sign-stored-url", () => ({
  signStoredMediaUrl,
  parseSupabaseStorageUrl: vi.fn((url: string) =>
    url.includes("/storage/v1/object/")
      ? {
          bucket: "sketch-media",
          path: url.includes("inspection_2")
            ? "inspections/inspection_2/floor.png"
            : "inspections/inspection_1/floor.png",
        }
      : null,
  ),
}));

import { GET } from "../route";

const STALE_BACKGROUND =
  "https://project.supabase.co/storage/v1/object/sign/sketch-media/inspections/inspection_1/background.png?token=stale";
const STALE_RENDERED =
  "https://project.supabase.co/storage/v1/object/sign/sketch-media/inspections/inspection_1/rendered.png?token=stale";
const FRESH_BACKGROUND =
  "https://project.supabase.co/storage/v1/object/sign/sketch-media/inspections/inspection_1/background.png?token=fresh";
const FRESH_RENDERED =
  "https://project.supabase.co/storage/v1/object/sign/sketch-media/inspections/inspection_1/rendered.png?token=fresh";
const OTHER_INSPECTION_BACKGROUND =
  "https://project.supabase.co/storage/v1/object/sign/sketch-media/inspections/inspection_2/background.png?token=stale";

const SIGNING_CONSTRAINTS = {
  expectedBucket: "sketch-media",
  requiredPathPrefix: "inspections/inspection_1/",
};

function request() {
  return new NextRequest(
    "http://localhost/api/inspections/inspection_1/sketches",
  );
}

function context() {
  return { params: Promise.resolve({ id: "inspection_1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  assertInspectionTenancy.mockResolvedValue({ ok: true });
});

describe("GET /api/inspections/[id]/sketches media signing", () => {
  it("does not read or sign sketch media before authentication", async () => {
    getServerSession.mockResolvedValueOnce(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    expect(assertInspectionTenancy).not.toHaveBeenCalled();
    expect(claimSketchFindMany).not.toHaveBeenCalled();
    expect(signStoredMediaUrl).not.toHaveBeenCalled();
  });

  it("does not read or sign sketch media before tenancy validation", async () => {
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: "Forbidden",
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(403);
    expect(claimSketchFindMany).not.toHaveBeenCalled();
    expect(signStoredMediaUrl).not.toHaveBeenCalled();
  });

  it("re-signs an underlay and keeps Fabric JSON synchronized", async () => {
    const persistedSketchData = {
      version: "6.0.0",
      objects: [{ type: "rect", left: 40, top: 20 }],
      backgroundImage: {
        type: "Image",
        src: STALE_BACKGROUND,
        opacity: 0.35,
        scaleX: 1.25,
      },
    };
    claimSketchFindMany.mockResolvedValueOnce([
      {
        id: "sketch_1",
        inspectionId: "inspection_1",
        backgroundImageUrl: STALE_BACKGROUND,
        renderedPngUrl: STALE_RENDERED,
        sketchData: persistedSketchData,
        annotations: [],
      },
    ]);
    signStoredMediaUrl.mockImplementation(async (url: string) => {
      if (url === STALE_BACKGROUND) return FRESH_BACKGROUND;
      if (url === STALE_RENDERED) return FRESH_RENDERED;
      return url;
    });

    const response = await GET(request(), context());
    const body = await response.json();
    const sketch = body.sketches[0];

    expect(response.status).toBe(200);
    expect(signStoredMediaUrl).toHaveBeenNthCalledWith(
      1,
      STALE_BACKGROUND,
      SIGNING_CONSTRAINTS,
    );
    expect(signStoredMediaUrl).toHaveBeenNthCalledWith(
      2,
      STALE_RENDERED,
      SIGNING_CONSTRAINTS,
    );
    expect(sketch.backgroundImageUrl).toBe(FRESH_BACKGROUND);
    expect(sketch.renderedPngUrl).toBe(FRESH_RENDERED);
    expect(sketch.sketchData).toEqual({
      ...persistedSketchData,
      backgroundImage: {
        ...persistedSketchData.backgroundImage,
        src: FRESH_BACKGROUND,
      },
    });
    expect(sketch.sketchData.objects).toEqual(persistedSketchData.objects);

    // Read-time signing must never mutate or persist the stored JSON/URLs.
    expect(persistedSketchData.backgroundImage.src).toBe(STALE_BACKGROUND);
    expect(claimSketchUpdate).not.toHaveBeenCalled();
  });

  it("keeps an explicit underlay clear authoritative over stale Fabric JSON", async () => {
    const persistedSketchData = {
      objects: [{ type: "rect", left: 40, top: 20 }],
      backgroundImage: {
        type: "Image",
        src: STALE_BACKGROUND,
        opacity: 0.35,
      },
    };
    claimSketchFindMany.mockResolvedValueOnce([
      {
        id: "sketch_1",
        backgroundImageUrl: null,
        renderedPngUrl: null,
        sketchData: persistedSketchData,
        annotations: [],
      },
    ]);

    const response = await GET(request(), context());
    const sketch = (await response.json()).sketches[0];

    expect(response.status).toBe(200);
    expect(signStoredMediaUrl).not.toHaveBeenCalled();
    expect(sketch.backgroundImageUrl).toBeNull();
    expect(sketch.renderedPngUrl).toBeNull();
    expect(sketch.sketchData).toEqual({ objects: persistedSketchData.objects });
    expect(persistedSketchData.backgroundImage.src).toBe(STALE_BACKGROUND);
    expect(claimSketchUpdate).not.toHaveBeenCalled();
  });

  it("fails a cross-inspection underlay closed without persisting it", async () => {
    const persistedSketchData = {
      objects: [{ type: "rect", width: 100, height: 80 }],
      backgroundImage: {
        type: "Image",
        src: OTHER_INSPECTION_BACKGROUND,
        opacity: 0.3,
      },
    };
    claimSketchFindMany.mockResolvedValueOnce([
      {
        id: "sketch_1",
        backgroundImageUrl: OTHER_INSPECTION_BACKGROUND,
        renderedPngUrl: null,
        sketchData: persistedSketchData,
        annotations: [],
      },
    ]);
    signStoredMediaUrl.mockImplementation(
      async (url: string, options: { requiredPathPrefix: string }) =>
        url.includes(
          `/storage/v1/object/sign/sketch-media/${options.requiredPathPrefix}`,
        )
          ? url
          : null,
    );

    const response = await GET(request(), context());
    const sketch = (await response.json()).sketches[0];

    expect(response.status).toBe(200);
    expect(signStoredMediaUrl).toHaveBeenCalledWith(
      OTHER_INSPECTION_BACKGROUND,
      SIGNING_CONSTRAINTS,
    );
    expect(sketch.backgroundImageUrl).toBeNull();
    expect(sketch.sketchData).toEqual({ objects: persistedSketchData.objects });
    expect(claimSketchUpdate).not.toHaveBeenCalled();
  });

  it("fails media closed to null while preserving vector data", async () => {
    const persistedSketchData = {
      version: "6.0.0",
      objects: [
        {
          type: "path",
          path: [
            ["M", 0, 0],
            ["L", 10, 10],
          ],
        },
      ],
      viewportTransform: [1, 0, 0, 1, 12, 18],
      backgroundImage: {
        type: "Image",
        src: STALE_BACKGROUND,
        opacity: 0.4,
      },
    };
    claimSketchFindMany.mockResolvedValueOnce([
      {
        id: "sketch_1",
        backgroundImageUrl: STALE_BACKGROUND,
        renderedPngUrl: STALE_RENDERED,
        sketchData: persistedSketchData,
        annotations: [],
      },
    ]);
    signStoredMediaUrl.mockRejectedValue(new Error("storage unavailable"));

    const response = await GET(request(), context());
    const sketch = (await response.json()).sketches[0];

    expect(response.status).toBe(200);
    expect(sketch.backgroundImageUrl).toBeNull();
    expect(sketch.renderedPngUrl).toBeNull();
    expect(sketch.sketchData).toEqual({
      version: persistedSketchData.version,
      objects: persistedSketchData.objects,
      viewportTransform: persistedSketchData.viewportTransform,
    });
    expect(persistedSketchData.backgroundImage.src).toBe(STALE_BACKGROUND);
    expect(claimSketchUpdate).not.toHaveBeenCalled();
  });
});
