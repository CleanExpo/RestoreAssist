/**
 * RA-7054: GET /api/inspections/[id]/photos must return the RA-446 label
 * fields. The photos page dereferences photo.secondaryDamageIndicators
 * unconditionally (e.g. `.includes("ASBESTOS_SUSPECT")`), so omitting the
 * field from the list payload crashes the page with
 * `TypeError: Cannot read properties of undefined (reading 'includes')`.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const photoFindMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: (...a: unknown[]) => inspectionFindFirst(...a) },
    inspectionPhoto: { findMany: (...a: unknown[]) => photoFindMany(...a) },
  },
}));
vi.mock("@/lib/storage", () => ({ getStorageProvider: vi.fn() }));
vi.mock("@/lib/media/exif-extract", () => ({
  extractAndSaveMediaAsset: vi.fn(),
}));
vi.mock("@/lib/media/catalog", () => ({ scheduleCatalog: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn() }));

/** Full DB row as Prisma stores it — superset of any select */
const DB_PHOTO: Record<string, unknown> = {
  id: "p_1",
  url: "https://stor/p1.jpg",
  thumbnailUrl: null,
  location: "Kitchen",
  description: null,
  timestamp: new Date("2026-07-01T00:00:00Z"),
  fileSize: 1234,
  mimeType: "image/jpeg",
  damageCategory: "CAT_2",
  damageClass: null,
  s500SectionRef: null,
  roomType: "KITCHEN",
  moistureSource: null,
  affectedMaterial: ["PLASTER"],
  surfaceOrientation: null,
  damageExtentEstimate: null,
  equipmentVisible: false,
  secondaryDamageIndicators: ["ASBESTOS_SUSPECT"],
  photoStage: null,
  captureAngle: null,
  labelledBy: "HUMAN_TECH",
  technicianNotes: null,
  moistureReadingLink: null,
};

/** RA-446 label fields the photos page dereferences (page.tsx Photo type) */
const LABEL_FIELDS = [
  "damageCategory",
  "damageClass",
  "s500SectionRef",
  "roomType",
  "moistureSource",
  "affectedMaterial",
  "surfaceOrientation",
  "damageExtentEstimate",
  "equipmentVisible",
  "secondaryDamageIndicators",
  "photoStage",
  "captureAngle",
  "labelledBy",
  "technicianNotes",
  "moistureReadingLink",
] as const;

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/inspections/i_1/photos", {
    method: "GET",
  });
}

function ctx() {
  return { params: Promise.resolve({ id: "i_1" }) };
}

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindFirst.mockReset();
  photoFindMany.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "u_1" } });
  inspectionFindFirst.mockResolvedValue({ id: "i_1" });
  // Honour Prisma select semantics: only selected keys come back
  photoFindMany.mockImplementation(
    async ({ select }: { select: Record<string, boolean> }) => [
      Object.fromEntries(
        Object.keys(select)
          .filter((k) => select[k])
          .map((k) => [k, DB_PHOTO[k]]),
      ),
    ],
  );
});

describe("GET /api/inspections/[id]/photos (RA-7054 label payload)", () => {
  it("returns every RA-446 label field the photos page dereferences", async () => {
    const res = await GET(makeRequest(), ctx());
    expect(res.status).toBe(200);
    const { photos } = await res.json();
    expect(photos).toHaveLength(1);
    for (const field of LABEL_FIELDS) {
      expect(photos[0], `payload missing "${field}"`).toHaveProperty(field);
    }
  });

  it("secondaryDamageIndicators supports the page's unconditional .includes() deref", async () => {
    const res = await GET(makeRequest(), ctx());
    const { photos } = await res.json();
    // Crash shape from RA-7054: page.tsx runs this exact expression per photo
    expect(() =>
      photos[0].secondaryDamageIndicators.includes("ASBESTOS_SUSPECT"),
    ).not.toThrow();
    expect(photos[0].secondaryDamageIndicators).toEqual(["ASBESTOS_SUSPECT"]);
    expect(photos[0].affectedMaterial).toEqual(["PLASTER"]);
  });

  it("401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), ctx());
    expect(res.status).toBe(401);
  });

  it("404 when inspection is not owned by the user", async () => {
    inspectionFindFirst.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), ctx());
    expect(res.status).toBe(404);
  });
});
