/**
 * RA-8522 — GET /api/inspections/[id]/photos pages past the newest 500.
 *
 * The site visit front photo picker could only reach the newest 500 photos,
 * so on a larger job an older front of property photo could not be chosen.
 * The list now says when more photos exist (`nextCursor`) and `?cursor=`
 * returns the next page. A call with no cursor answers as before (the newest
 * 500), so the other callers are unchanged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PHOTO_LIST_PAGE } from "../route";

const getServerSession = vi.fn();
const photoFindMany = vi.fn();
const photoFindFirst = vi.fn();
const assertInspectionReadable = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionReadable: (...a: unknown[]) => assertInspectionReadable(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspectionPhoto: {
      findMany: (...a: unknown[]) => photoFindMany(...a),
      findFirst: (...a: unknown[]) => photoFindFirst(...a),
    },
  },
}));
vi.mock("@/lib/storage", () => ({ getStorageProvider: vi.fn() }));
vi.mock("@/lib/media/exif-extract", () => ({ extractAndSaveMediaAsset: vi.fn() }));
vi.mock("@/lib/media/catalog", () => ({ scheduleCatalog: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn() }));

/** 1,200 photos, newest first, as the database would order them. */
const ALL = Array.from({ length: 1200 }, (_, i) => ({ id: `ph_${String(i + 1).padStart(4, "0")}`, url: null, thumbnailUrl: null }));

/** Honour take, cursor and skip the way Prisma does over the ordered rows. */
function fakeFindMany(args: { take: number; skip?: number; cursor?: { id: string } }) {
  let start = 0;
  if (args.cursor) start = ALL.findIndex((p) => p.id === args.cursor!.id) + (args.skip ?? 0);
  return ALL.slice(start, start + args.take);
}

const req = (qs = "") => new NextRequest(`http://localhost/api/inspections/i_1/photos${qs}`);
const ctx = { params: Promise.resolve({ id: "i_1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "u_1" } });
  assertInspectionReadable.mockResolvedValue({ ok: true, data: { id: "i_1" } });
  photoFindMany.mockImplementation(async (a) => fakeFindMany(a));
  photoFindFirst.mockImplementation(async ({ where }: { where: { id: string; inspectionId: string } }) =>
    where.inspectionId === "i_1" && ALL.some((p) => p.id === where.id) ? { id: where.id } : null,
  );
});

describe("GET /api/inspections/[id]/photos paging (RA-8522)", () => {
  it("answers a call with no cursor with the newest page, and says more exist", async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.photos).toHaveLength(PHOTO_LIST_PAGE);
    expect(body.photos[0].id).toBe("ph_0001");
    expect(body.nextCursor).toBe(body.photos[PHOTO_LIST_PAGE - 1].id);
  });

  it("reaches every photo by following nextCursor, with none repeated or missed", async () => {
    const seen: string[] = [];
    let qs = "";
    for (let page = 0; page < 10; page++) {
      const body = await (await GET(req(qs), ctx)).json();
      seen.push(...body.photos.map((p: { id: string }) => p.id));
      if (!body.nextCursor) break;
      qs = `?cursor=${encodeURIComponent(body.nextCursor)}`;
    }
    expect(seen).toEqual(ALL.map((p) => p.id));
  });

  it("orders by time then id, so photos taken in the same second page stably", async () => {
    await GET(req(), ctx);
    expect(photoFindMany.mock.calls[0][0].orderBy).toEqual([{ timestamp: "desc" }, { id: "desc" }]);
  });

  it("refuses a cursor that is not a photo of this job, without listing anything", async () => {
    const res = await GET(req("?cursor=ph_other_job"), ctx);
    expect(res.status).toBe(400);
    expect(photoFindMany).not.toHaveBeenCalled();
  });
});
