import { describe, it, expect, vi, beforeEach } from "vitest";

// Signing is covered by the signing and binding tests; keep the URL here so
// each fetch can be matched to its stored object.
vi.mock("@/lib/storage/sign-stored-url", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/sign-stored-url")>()),
  signStoredMediaUrl: async (u: string | null | undefined) => u,
}));

import {
  prepareReportPhotos,
  type InspectionPhotoRow,
} from "../inspection-photos-to-images";

// Only storage objects under the report's own inspection are fetched (RA-7879).
const HOST = "https://abc.supabase.co";
const u = (name: string) =>
  `${HOST}/storage/v1/object/public/evidence-optimised/org-1/insp-1/${name}`;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", HOST);
});

async function embedPhotos(
  photos: InspectionPhotoRow[],
  fetchImpl: typeof fetch,
  evidenceLabelsByPhotoId?: ReadonlyMap<string, string[]>,
) {
  return (
    await prepareReportPhotos(photos, {
      inspectionId: "insp-1",
      ownerFolders: ["org-1"],
      fetchImpl,
      evidenceLabelsByPhotoId,
    })
  ).photos;
}

const PNG_SIG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPG_SIG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function fakeFetch(map: Record<string, Uint8Array | "fail">) {
  return vi.fn(async (url: string) => {
    const v = map[url];
    if (!v || v === "fail") {
      return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    return {
      ok: true,
      arrayBuffer: async () =>
        v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength),
    };
  });
}

describe("prepareReportPhotos embedding", () => {
  it("fetches each photo and detects PNG vs JPG from the bytes", async () => {
    const photos = [
      {
        url: u("a.png"),
        mimeType: "image/png",
        description: "Kitchen leak",
      },
      {
        url: u("b.jpg"),
        mimeType: "image/jpeg",
        description: "Ceiling stain",
      },
    ];
    const fetchImpl = fakeFetch({
      [u("a.png")]: PNG_SIG,
      [u("b.jpg")]: JPG_SIG,
    });

    const imgs = await embedPhotos(photos, fetchImpl as never);

    expect(imgs).toHaveLength(2);
    expect(imgs[0].isPng).toBe(true);
    expect(imgs[1].isPng).toBe(false);
    expect(imgs[0].caption).toBe("Kitchen leak");
  });

  it("prefers thumbnailUrl over url to bound embedded size", async () => {
    const photos = [
      { url: u("full.jpg"), thumbnailUrl: u("thumb.jpg") },
    ];
    const fetchImpl = fakeFetch({ [u("thumb.jpg")]: JPG_SIG });

    const imgs = await embedPhotos(photos, fetchImpl as never);

    expect(imgs).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith(u("thumb.jpg"), expect.anything());
    expect(fetchImpl).not.toHaveBeenCalledWith(u("full.jpg"), expect.anything());
  });

  it("resolves caption description → location → roomType → empty", async () => {
    const photos = [
      { url: u("1"), location: "Master bedroom" },
      { url: u("2"), roomType: "BATHROOM" },
      { url: u("3") },
    ];
    const fetchImpl = fakeFetch({
      [u("1")]: JPG_SIG,
      [u("2")]: JPG_SIG,
      [u("3")]: JPG_SIG,
    });

    const imgs = await embedPhotos(photos, fetchImpl as never);

    expect(imgs.map((i) => i.caption)).toEqual([
      "Master bedroom",
      "BATHROOM",
      "",
    ]);
  });

  it("skips a photo with no usable url and one whose fetch fails", async () => {
    const photos = [
      { url: "" },
      { url: u("ok"), description: "good" },
      { url: u("broken"), description: "bad" },
    ];
    const fetchImpl = fakeFetch({
      [u("ok")]: PNG_SIG,
      [u("broken")]: "fail",
    });

    const imgs = await embedPhotos(photos, fetchImpl as never);

    expect(imgs.map((i) => i.caption)).toEqual(["good"]);
  });

  it("returns [] for empty input", async () => {
    expect(await embedPhotos([], fakeFetch({}) as never)).toEqual(
      [],
    );
  });

  it("prefixes matching gallery captions with their floor-plan evidence labels", async () => {
    const photos = [
      {
        id: "photo-1",
        url: u("1"),
        description: "Kitchen leak",
      },
      { id: "photo-2", url: u("2") },
    ];
    const fetchImpl = fakeFetch({
      [u("1")]: JPG_SIG,
      [u("2")]: JPG_SIG,
    });
    const labels = new Map([
      ["photo-1", ["E1", "E3"]],
      ["photo-2", ["E2"]],
    ]);

    const imgs = await embedPhotos(
      photos,
      fetchImpl as never,
      labels,
    );

    expect(imgs.map((image) => image.caption)).toEqual([
      "E1, E3 · Kitchen leak",
      "E2 · Inspection evidence",
    ]);
  });
});
