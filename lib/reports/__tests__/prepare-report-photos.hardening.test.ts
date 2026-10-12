import { describe, it, expect, vi, beforeEach } from "vitest";

// Cursor re-review of 5b812a99 and the engineering bench (02/10/2026): the
// binding compared one path segment, so traversal forms still signed another
// tenant's object; nothing bounded time, parallelism or row count; and an
// omission carried no reason or report id. These pin each of those.
const signStoredMediaUrl = vi.fn(async (url: string | null | undefined) =>
  url ? `${url}?token=signed` : url,
);
vi.mock("@/lib/storage/sign-stored-url", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/sign-stored-url")>()),
  signStoredMediaUrl: (u: string | null | undefined) => signStoredMediaUrl(u),
}));

import { photoOwnerFolders, prepareReportPhotos } from "../inspection-photos-to-images";

const HOST = "https://abc.supabase.co";
const JPG_SIG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const obj = (path: string) =>
  `${HOST}/storage/v1/object/public/evidence-optimised/${path}`;
const ok = () => ({ ok: true, arrayBuffer: async () => JPG_SIG.buffer.slice(0) });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", HOST);
  signStoredMediaUrl.mockClear();
});

describe("prepareReportPhotos refuses paths that leave the inspection", () => {
  it.each([
    ["encoded traversal", obj("org-1/insp-1%2F..%2F..%2Fvictim-org%2Fvictim-insp%2Fsecret.jpg")],
    ["storage locator traversal", "storage://evidence-optimised/org-1/insp-1/../../victim-org/victim-insp/secret.jpg"],
    ["encoded dot segment in a locator", "storage://evidence-optimised/org-1/insp-1/%2e%2e/x.jpg"],
    ["empty segment", "storage://evidence-optimised/org-1/insp-1//x.jpg"],
    ["the inspection folder itself", "storage://evidence-optimised/org-1/insp-1"],
    ["sketch-media for another inspection", "storage://sketch-media/inspections/insp-2/photos/x.jpg"],
  ])("does not sign %s", async (_label, url) => {
    const fetchImpl = vi.fn(async () => ok());
    const out = await prepareReportPhotos([{ id: "p1", inspectionId: "insp-1", url }], {
      inspectionId: "insp-1", ownerFolders: ["org-1"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(signStoredMediaUrl).not.toHaveBeenCalled();
    expect(out.missing).toBe(1);
    expect(out.reasons.foreign_path).toBe(1);
  });

  it("signs a sketch-media photo stored under its own inspection", async () => {
    const out = await prepareReportPhotos(
      [{ id: "p1", url: "storage://sketch-media/inspections/insp-1/photos/x.jpg" }],
      { inspectionId: "insp-1", ownerFolders: ["org-1"], fetchImpl: vi.fn(async () => ok()) as unknown as typeof fetch },
    );
    expect(out.photos).toHaveLength(1);
  });

  it("refuses a row whose inspection differs from the report's inspection", async () => {
    const out = await prepareReportPhotos(
      [{ id: "p1", inspectionId: "insp-2", url: obj("org-1/insp-2/a.jpg") }],
      { inspectionId: "insp-1", ownerFolders: ["org-1"], fetchImpl: vi.fn(async () => ok()) as unknown as typeof fetch },
    );
    expect(signStoredMediaUrl).not.toHaveBeenCalled();
    expect(out.reasons.foreign_path).toBe(1);
  });
});

describe("prepareReportPhotos binds the organisation folder too", () => {
  // Cursor review of 46180ae2 (P1): only the inspection folder was compared,
  // so another organisation's folder holding the same inspection id was
  // signed, including after a URL collapsed `evil/insp-1/../../victim-org`.
  it.each([
    ["another organisation's folder", "storage://evidence-optimised/victim-org/insp-1/secret.jpg"],
    ["a URL whose dot segments collapse onto another organisation", obj("evil/insp-1/../../victim-org/insp-1/secret.jpg")],
    ["encoded dot segments that collapse onto another organisation", obj("evil/insp-1/%2e%2e/%2e%2e/victim-org/insp-1/secret.jpg")],
  ])("does not sign %s", async (_label, url) => {
    const out = await prepareReportPhotos([{ id: "p1", url }], {
      inspectionId: "insp-1",
      ownerFolders: ["org-1"],
      fetchImpl: vi.fn(async () => ok()) as unknown as typeof fetch,
    });
    expect(signStoredMediaUrl).not.toHaveBeenCalled();
    expect(out.reasons.foreign_path).toBe(1);
  });

  it("signs the folders genuine uploads use: owner organisation, workspace, and no-org", async () => {
    const out = await prepareReportPhotos(
      [
        { id: "p1", url: obj("org-1/insp-1/a.jpg") },
        { id: "p2", url: obj("ws-1/insp-1/b.jpg") },
        { id: "p3", url: obj("no-org/insp-1/c.jpg") },
      ],
      {
        inspectionId: "insp-1",
        ownerFolders: ["org-1", "ws-1", "no-org"],
        fetchImpl: vi.fn(async () => ok()) as unknown as typeof fetch,
      },
    );
    expect(out.photos).toHaveLength(3);
  });

  it("signs no storage object when the caller names no owner folder", async () => {
    const out = await prepareReportPhotos([{ id: "p1", url: obj("org-1/insp-1/a.jpg") }], {
      inspectionId: "insp-1",
      fetchImpl: vi.fn(async () => ok()) as unknown as typeof fetch,
    });
    expect(signStoredMediaUrl).not.toHaveBeenCalled();
    expect(out.reasons.foreign_path).toBe(1);
  });
});

describe("photoOwnerFolders", () => {
  it("lists the owner's organisation, the workspace, the owner id and no-org, without blanks", () => {
    expect(
      photoOwnerFolders({ userId: "u-1", workspaceId: null, user: { organizationId: "org-1" } }),
    ).toEqual(["org-1", "u-1", "no-org"]);
    expect(
      photoOwnerFolders({ userId: "u-1", workspaceId: "ws-1", user: { organizationId: null } }),
    ).toEqual(["ws-1", "u-1", "no-org"]);
  });
});

describe("prepareReportPhotos never lets one row fail the batch", () => {
  // Cursor review of a827a4c6 (P1): a malformed %-escape made the path check
  // throw outside the per-photo handling, so the whole PDF failed.
  it("counts a malformed path as refused and still embeds its sibling", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await prepareReportPhotos(
      [
        { id: "bad", url: obj("org-1/insp-1/a%ZZb.jpg") },
        { id: "good", url: obj("org-1/insp-1/b.jpg") },
      ],
      { inspectionId: "insp-1", ownerFolders: ["org-1"], fetchImpl: vi.fn(async () => ok()) as unknown as typeof fetch },
    );
    error.mockRestore();
    expect(out.photos).toHaveLength(1);
    expect(out.reasons.foreign_path).toBe(1);
  });
});

describe("prepareReportPhotos is bounded", () => {
  it("counts a photo whose fetch never answers as missing instead of hanging", async () => {
    const fetchImpl = vi.fn((url: string) =>
      url.includes("slow") ? new Promise(() => {}) : Promise.resolve(ok()),
    );
    const out = await prepareReportPhotos(
      [
        { id: "p1", url: obj("org-1/insp-1/slow.jpg") },
        { id: "p2", url: obj("org-1/insp-1/fast.jpg") },
      ],
      { inspectionId: "insp-1", ownerFolders: ["org-1"], fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 50 },
    );
    expect(out.photos).toHaveLength(1);
    expect(out.reasons.timeout).toBe(1);
  });

  it("never runs more than the concurrency cap at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return ok();
    });
    const photos = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      url: obj(`org-1/insp-1/${i}.jpg`),
    }));
    const out = await prepareReportPhotos(photos, {
      inspectionId: "insp-1", ownerFolders: ["org-1"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      concurrency: 4,
    });
    expect(out.photos).toHaveLength(20);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it("counts photos beyond the query limit as missing", async () => {
    const out = await prepareReportPhotos([{ id: "p1", url: obj("org-1/insp-1/a.jpg") }], {
      inspectionId: "insp-1", ownerFolders: ["org-1"],
      fetchImpl: vi.fn(async () => ok()) as unknown as typeof fetch,
      totalCount: 4,
    });
    expect(out.photos).toHaveLength(1);
    expect(out.missing).toBe(3);
    expect(out.reasons.over_limit).toBe(3);
  });
});

describe("prepareReportPhotos logs every omission with its reason and report", () => {
  it("logs report and inspection ids with counts by reason", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await prepareReportPhotos(
      [
        { id: "p1", url: obj("victim-org/victim-insp/a.jpg") },
        { id: "p2", url: obj("org-1/insp-1/b.jpg") },
      ],
      {
        inspectionId: "insp-1",
        ownerFolders: ["org-1"],
        reportId: "rep-1",
        fetchImpl: vi.fn(async () => ({
          ok: false,
          status: 503,
          arrayBuffer: async () => new ArrayBuffer(0),
        })) as unknown as typeof fetch,
      },
    );
    expect(error).toHaveBeenCalledWith(
      "[report-photos] refused a photo outside its inspection",
      expect.objectContaining({ reportId: "rep-1", inspectionId: "insp-1", photoId: "p1" }),
    );
    expect(error).toHaveBeenCalledWith(
      "[report-photos] photos could not be included",
      expect.objectContaining({
        reportId: "rep-1",
        inspectionId: "insp-1",
        total: 2,
        missing: 2,
        reasons: expect.objectContaining({ foreign_path: 1, fetch_failed: 1 }),
      }),
    );
    error.mockRestore();
  });
});
