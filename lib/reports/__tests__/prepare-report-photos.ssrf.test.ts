import { describe, it, expect, vi, beforeEach } from "vitest";

// RA-7879: report generation fetches each stored photo URL from the server. A
// URL that is not one of our storage objects must never be fetched, or a row
// carrying an internal address turns report generation into an SSRF probe.
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

const METADATA = "http://169.254.169.254/latest/meta-data/";
const LOCAL_DB = "http://localhost:5432/";

function okFetch() {
  return vi.fn(async (_url: string) => ({
    ok: true,
    arrayBuffer: async () => JPG_SIG.buffer.slice(0),
  }));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", HOST);
  signStoredMediaUrl.mockClear();
});

describe("prepareReportPhotos never fetches a non-storage URL (RA-7879)", () => {
  it("omits internal-address photos without fetching them, and keeps a valid storage photo", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = okFetch();
    const out = await prepareReportPhotos(
      [
        { id: "meta", inspectionId: "insp-1", url: METADATA },
        { id: "db", inspectionId: "insp-1", url: LOCAL_DB },
        {
          id: "thumb",
          inspectionId: "insp-1",
          url: obj("org-1/insp-1/full.jpg"),
          thumbnailUrl: METADATA,
        },
        { id: "good", inspectionId: "insp-1", url: obj("org-1/insp-1/a.jpg") },
      ],
      {
        inspectionId: "insp-1",
        ownerFolders: ["org-1"],
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    );

    const fetched = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(fetched.some((u) => u.includes("169.254.169.254"))).toBe(false);
    expect(fetched.some((u) => u.includes("localhost"))).toBe(false);
    expect(fetched).toEqual([`${obj("org-1/insp-1/a.jpg")}?token=signed`]);
    expect(signStoredMediaUrl).toHaveBeenCalledTimes(1);

    expect(out.photos).toHaveLength(1);
    expect(out.missing).toBe(3);
    expect(warn).toHaveBeenCalledWith(
      "[report-photos] photos could not be included",
      expect.objectContaining({
        missingPhotoIds: ["meta", "db", "thumb"],
      }),
    );
    warn.mockRestore();
  });

  it("omits a non-storage URL even when no inspection binding is supplied", async () => {
    const fetchImpl = okFetch();
    const out = await prepareReportPhotos([{ id: "p1", url: METADATA }], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(signStoredMediaUrl).not.toHaveBeenCalled();
    expect(out.photos).toHaveLength(0);
    expect(out.missing).toBe(1);
  });
});

// RA-7879 follow-up: genuine photos hosted on our own Cloudinary account must
// still reach the report. Only https://res.cloudinary.com/<our cloud>/… is
// allowed, fetched as-is (public), never through the storage signer.
describe("prepareReportPhotos allows only our own Cloudinary photos", () => {
  const CLOUD = "ra-cloud";
  const ours = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/inspection-photos/a.jpg`;

  beforeEach(() => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", CLOUD);
    vi.stubEnv("CLOUDINARY_URL", "");
  });

  const run = (url: string, fetchImpl = okFetch()) =>
    prepareReportPhotos([{ id: "p1", inspectionId: "insp-1", url }], {
      inspectionId: "insp-1",
      ownerFolders: ["org-1"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).then((out) => ({ out, fetchImpl }));

  it("includes a photo under our cloud name, fetched once as stored and unsigned", async () => {
    const { out, fetchImpl } = await run(ours);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(ours, expect.anything());
    expect(signStoredMediaUrl).not.toHaveBeenCalled();
    expect(out.photos).toHaveLength(1);
    expect(out.missing).toBe(0);
  });

  it.each([
    ["another cloud name", "https://res.cloudinary.com/other-cloud/image/upload/a.jpg"],
    ["http", `http://res.cloudinary.com/${CLOUD}/image/upload/a.jpg`],
    ["a port", `https://res.cloudinary.com:8443/${CLOUD}/image/upload/a.jpg`],
    ["userinfo", `https://x@res.cloudinary.com/${CLOUD}/image/upload/a.jpg`],
    ["a lookalike suffix host", `https://res.cloudinary.com.evil.com/${CLOUD}/image/upload/a.jpg`],
    ["a lookalike prefix host", `https://evilres.cloudinary.com/${CLOUD}/image/upload/a.jpg`],
    ["the metadata address", METADATA],
    ["localhost", LOCAL_DB],
  ])("omits %s without fetching it", async (_label, url) => {
    const { out, fetchImpl } = await run(url);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(signStoredMediaUrl).not.toHaveBeenCalled();
    expect(out.photos).toHaveLength(0);
    expect(out.missing).toBe(1);
  });

  it("allows no Cloudinary URL when no cloud name is configured", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "");
    const { out, fetchImpl } = await run(ours);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out.photos).toHaveLength(0);
    expect(out.missing).toBe(1);
  });
});
