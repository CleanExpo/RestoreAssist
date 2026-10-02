import { describe, it, expect, vi, beforeEach } from "vitest";

// Review 35e2911a (Cursor, 02/10/2026) found two P1s in the report photo path:
// it signed ANY private-bucket path a photo row carried, and a photo that could
// not be included still vanished without a word. These pin both.
const signStoredMediaUrl = vi.fn(async (url: string | null | undefined) =>
  url ? `${url}?token=signed` : url,
);
vi.mock("@/lib/storage/sign-stored-url", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/sign-stored-url")>()),
  signStoredMediaUrl: (u: string | null | undefined) => signStoredMediaUrl(u),
}));

import { prepareReportPhotos } from "../inspection-photos-to-images";

const HOST = "https://abc.supabase.co";
const JPG_SIG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const obj = (path: string) =>
  `${HOST}/storage/v1/object/public/evidence-optimised/${path}`;

function okFetch() {
  return vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => JPG_SIG.buffer.slice(0),
  }));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", HOST);
  signStoredMediaUrl.mockClear();
});

describe("prepareReportPhotos binds signing to the photo's own inspection", () => {
  it("signs and embeds a photo stored under its own inspection", async () => {
    const fetchImpl = okFetch();
    const out = await prepareReportPhotos(
      [{ id: "p1", inspectionId: "insp-1", url: obj("org-1/insp-1/a.jpg") }],
      { ownerFolders: ["org-1"], fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(signStoredMediaUrl).toHaveBeenCalledWith(obj("org-1/insp-1/a.jpg"));
    expect(out.photos).toHaveLength(1);
    expect(out.missing).toBe(0);
  });

  it("refuses to sign another inspection's object and counts it missing", async () => {
    const fetchImpl = okFetch();
    const out = await prepareReportPhotos(
      [
        { id: "p1", inspectionId: "insp-1", url: obj("victim-org/victim-insp/secret.jpg") },
        { id: "p2", inspectionId: "insp-1", url: "storage://evidence-optimised/other-org/other-insp/x.jpg" },
      ],
      { ownerFolders: ["org-1"], fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(signStoredMediaUrl).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out.photos).toHaveLength(0);
    expect(out.missing).toBe(2);
  });

  it("refuses to sign a storage object when the row names no inspection", async () => {
    const fetchImpl = okFetch();
    const out = await prepareReportPhotos(
      [{ id: "p1", url: obj("org-1/insp-1/a.jpg") }],
      { ownerFolders: ["org-1"], fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(signStoredMediaUrl).not.toHaveBeenCalled();
    expect(out.missing).toBe(1);
  });

  it("still passes a legacy non-storage host through the signer unchanged", async () => {
    const fetchImpl = okFetch();
    const out = await prepareReportPhotos(
      [{ id: "p1", inspectionId: "insp-1", url: "https://res.cloudinary.com/x/a.jpg" }],
      { ownerFolders: ["org-1"], fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(out.photos).toHaveLength(1);
    expect(out.missing).toBe(0);
  });
});

describe("prepareReportPhotos never drops a photo silently", () => {
  it("counts a signing failure and a failed fetch, and logs a structured warning", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    signStoredMediaUrl.mockRejectedValueOnce(new Error("no service key"));
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
    const out = await prepareReportPhotos(
      [
        { id: "p1", inspectionId: "insp-1", url: obj("org-1/insp-1/a.jpg") },
        { id: "p2", inspectionId: "insp-1", url: obj("org-1/insp-1/b.jpg") },
      ],
      { ownerFolders: ["org-1"], fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(out.photos).toHaveLength(0);
    expect(out.missing).toBe(2);
    expect(warn).toHaveBeenCalledWith(
      "[report-photos] photos could not be included",
      expect.objectContaining({
        total: 2,
        missing: 2,
        reasons: { sign_failed: 1, fetch_failed: 1 },
      }),
    );
    warn.mockRestore();
  });
});
