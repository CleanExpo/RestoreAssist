/**
 * RA-8537 — contents pack-out item photos.
 *
 * An item's before / after photo must be a photo already uploaded to the
 * same job through /photos (the one upload path); the pack-out routes store
 * that photo's stored URL and re-sign it for display. Photo edits stay
 * owner/manager only (D-028: pack-out items carry money), and the photo PATCH
 * cannot change anything but the two photo fields.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SUPABASE = "https://proj.supabase.co";
const STORED = `${SUPABASE}/storage/v1/object/public/evidence-optimised/inspections/insp_1/sofa.webp`;
const SIGNED = `${SUPABASE}/storage/v1/object/sign/evidence-optimised/inspections/insp_1/sofa.webp?token=abc`;
const CLOUDINARY =
  "https://res.cloudinary.com/demo/image/upload/v1/inspections/insp_1/tv.jpg";

const photoFindMany = vi.fn();
const itemFindMany = vi.fn();
const itemFindFirst = vi.fn();
const itemUpdateMany = vi.fn();
const itemCreate = vi.fn();
const resolveInspectionWrite = vi.fn();
const assertInspectionTenancy = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "owner-1" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspectionPhoto: { findMany: (...a: unknown[]) => photoFindMany(...a) },
    contentsPackOutItem: {
      findMany: (...a: unknown[]) => itemFindMany(...a),
      findFirst: (...a: unknown[]) => itemFindFirst(...a),
      updateMany: (...a: unknown[]) => itemUpdateMany(...a),
    },
  },
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (req: NextRequest, _u: string, fn: (b: string) => unknown) =>
    req.text().then((b) => fn(b)),
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...a: unknown[]) => assertInspectionTenancy(...a),
  resolveInspectionWrite: (...a: unknown[]) => resolveInspectionWrite(...a),
  writeWithinInspectionScope: (
    _w: unknown,
    _d: unknown,
    fn: (tx: unknown) => unknown,
  ) =>
    fn({
      contentsPackOutItem: { create: (...a: unknown[]) => itemCreate(...a) },
    }),
}));
vi.mock("@/lib/storage/sign-stored-url", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/sign-stored-url")>()),
  // Stand-in for minting a signed URL: private-bucket URLs come back marked.
  signStoredMediaUrl: vi.fn(async (url: string | null) =>
    url && url.includes("/evidence-optimised/") ? `${url}#signed` : url,
  ),
}));

import { GET, POST } from "../route";
import * as itemRoute from "../[itemId]/route";

const ctx = { params: Promise.resolve({ id: "insp_1" }) };
const itemCtx = { params: Promise.resolve({ id: "insp_1", itemId: "item-1" }) };

function patch(body: unknown) {
  const req = new NextRequest(
    "http://localhost/api/inspections/insp_1/contents-pack-out/item-1",
    { method: "PATCH", body: JSON.stringify(body) },
  );
  // On main there is no PATCH export; calling it fails the test.
  const handler = (itemRoute as Record<string, unknown>).PATCH as (
    r: NextRequest,
    c: typeof itemCtx,
  ) => Promise<Response>;
  expect(typeof handler).toBe("function");
  return handler(req, itemCtx);
}

function post(body: unknown) {
  return POST(
    new NextRequest(
      "http://localhost/api/inspections/insp_1/contents-pack-out",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
    ctx,
  );
}

const item = (over: Record<string, unknown> = {}) => ({
  id: "item-1",
  inspectionId: "insp_1",
  itemDescription: "Three-seat fabric sofa",
  packOutDecision: "PACK_OUT",
  replacementValueAud: null,
  beforePhotoUrl: null,
  afterPhotoUrl: null,
  ...over,
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  for (const m of [
    photoFindMany,
    itemFindMany,
    itemFindFirst,
    itemUpdateMany,
    itemCreate,
  ]) {
    m.mockReset();
  }
  resolveInspectionWrite.mockResolvedValue({
    ok: true,
    data: {
      inspectionManyWhere: { id: "insp_1" },
      childInspectionFilter: { id: "insp_1", userId: "owner-1" },
    },
  });
  assertInspectionTenancy.mockResolvedValue({ ok: true });
  // Photos on this job: one Supabase (private bucket), one Cloudinary.
  photoFindMany.mockImplementation(
    async ({ where }: { where: { inspectionId: string } }) =>
      where.inspectionId === "insp_1"
        ? [{ url: STORED }, { url: CLOUDINARY }]
        : [],
  );
  itemUpdateMany.mockResolvedValue({ count: 1 });
  itemCreate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "item-1",
      ...data,
    }),
  );
});

afterEach(() => vi.unstubAllEnvs());

describe("PATCH contents-pack-out/[itemId] — item photos (RA-8537)", () => {
  it("stores the job photo's stored URL when the client sends its signed display URL", async () => {
    itemFindFirst.mockResolvedValue(item({ afterPhotoUrl: STORED }));
    const res = await patch({ afterPhotoUrl: SIGNED });
    expect(res.status).toBe(200);
    expect(itemUpdateMany).toHaveBeenCalledTimes(1);
    const call = itemUpdateMany.mock.calls[0][0];
    expect(call.data).toEqual({ afterPhotoUrl: STORED });
    // Write-time scope: the item, on this job, inside the caller's reach.
    expect(call.where).toMatchObject({
      id: "item-1",
      inspectionId: "insp_1",
      inspection: { id: "insp_1", userId: "owner-1" },
    });
    // The answer carries a displayable (re-signed) URL.
    expect((await res.json()).afterPhotoUrl).toBe(`${STORED}#signed`);
  });

  it("refuses a URL that is not a photo on this job and writes nothing", async () => {
    const res = await patch({ beforePhotoUrl: "https://evil.example/cat.jpg" });
    expect(res.status).toBe(400);
    expect(itemUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses money or decision fields: the body is photos only", async () => {
    const res = await patch({
      afterPhotoUrl: CLOUDINARY,
      replacementValueAud: 1,
    });
    expect(res.status).toBe(400);
    expect(itemUpdateMany).not.toHaveBeenCalled();
  });

  it("clears a photo with null", async () => {
    itemFindFirst.mockResolvedValue(item());
    const res = await patch({ beforePhotoUrl: null });
    expect(res.status).toBe(200);
    expect(itemUpdateMany.mock.calls[0][0].data).toEqual({
      beforePhotoUrl: null,
    });
  });

  it("stays owner/manager only: gates on resolveInspectionWrite and writes nothing when refused", async () => {
    resolveInspectionWrite.mockResolvedValue({
      ok: false,
      status: 404,
      reason: "Not found",
    });
    const res = await patch({ afterPhotoUrl: CLOUDINARY });
    expect(res.status).toBe(404);
    expect(resolveInspectionWrite).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: "owner-1" } }),
      "insp_1",
    );
    expect(itemUpdateMany).not.toHaveBeenCalled();
  });

  it("answers 404 when the item is not on this job", async () => {
    itemUpdateMany.mockResolvedValue({ count: 0 });
    const res = await patch({ afterPhotoUrl: CLOUDINARY });
    expect(res.status).toBe(404);
  });
});

describe("POST / GET contents-pack-out — item photos (RA-8537)", () => {
  it("POST refuses a before photo that is not on this job", async () => {
    const res = await post({
      itemDescription: "Sofa",
      packOutDecision: "PACK_OUT",
      beforePhotoUrl: "https://evil.example/cat.jpg",
    });
    expect(res.status).toBe(400);
    expect(itemCreate).not.toHaveBeenCalled();
  });

  it("POST stores the stored URL of a job photo sent by its signed URL", async () => {
    const res = await post({
      itemDescription: "Sofa",
      packOutDecision: "PACK_OUT",
      beforePhotoUrl: SIGNED,
    });
    expect(res.status).toBe(201);
    expect(itemCreate.mock.calls[0][0].data.beforePhotoUrl).toBe(STORED);
  });

  it("GET re-signs stored item photo URLs so private-bucket photos display", async () => {
    itemFindMany.mockResolvedValue([
      item({ beforePhotoUrl: STORED, afterPhotoUrl: CLOUDINARY }),
    ]);
    const res = await GET(
      new NextRequest(
        "http://localhost/api/inspections/insp_1/contents-pack-out",
      ),
      ctx,
    );
    const body = await res.json();
    expect(body.items[0].beforePhotoUrl).toBe(`${STORED}#signed`);
    expect(body.items[0].afterPhotoUrl).toBe(CLOUDINARY);
  });
});
