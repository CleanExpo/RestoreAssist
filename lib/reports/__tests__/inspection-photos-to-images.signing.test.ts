import { describe, it, expect, vi, beforeEach } from "vitest";

// The photo bucket is private. A report must fetch the re-signed URL, never
// the stored one: an unsigned fetch fails, and a failed photo is skipped, so
// the report would carry no photos and nothing would say so.
const signStoredMediaUrl = vi.fn(async (url: string | null | undefined) =>
  url ? `${url}?token=signed` : url,
);
vi.mock("@/lib/storage/sign-stored-url", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/sign-stored-url")>()),
  signStoredMediaUrl: (u: string | null | undefined) => signStoredMediaUrl(u),
}));

import { prepareReportPhotos } from "../inspection-photos-to-images";

const HOST = "https://abc.supabase.co";
const obj = (name: string) =>
  `${HOST}/storage/v1/object/public/evidence-optimised/org-1/insp-1/${name}`;
const binding = { inspectionId: "insp-1", ownerFolders: ["org-1"] };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", HOST);
});

const JPG_SIG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

/** A storage host that serves only signed requests, as the private bucket does. */
function privateBucketFetch() {
  return vi.fn(async (url: string) => {
    if (!url.endsWith("?token=signed")) {
      return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    return {
      ok: true,
      arrayBuffer: async () => JPG_SIG.buffer.slice(0),
    };
  });
}

describe("prepareReportPhotos signs private photo URLs", () => {
  it("embeds a photo whose stored URL only works once signed", async () => {
    const fetchImpl = privateBucketFetch();
    const { photos: out } = await prepareReportPhotos(
      [
        {
          id: "p1",
          url: obj("a.jpg"),
          thumbnailUrl: obj("a_thumb.jpg"),
          description: "Bedroom 4 ceiling",
        },
      ],
      { ...binding, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      `${obj("a_thumb.jpg")}?token=signed`,
      expect.anything(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].caption).toBe("Bedroom 4 ceiling");
  });

  it("falls back to the full image URL, signed, when there is no thumbnail", async () => {
    const fetchImpl = privateBucketFetch();
    const { photos: out } = await prepareReportPhotos(
      [{ url: obj("b.jpg") }],
      { ...binding, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      `${obj("b.jpg")}?token=signed`,
      expect.anything(),
    );
    expect(out).toHaveLength(1);
  });
});
