import { describe, it, expect, vi } from "vitest";
import { inspectionPhotosToImages } from "../inspection-photos-to-images";

const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
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

describe("inspectionPhotosToImages", () => {
  it("fetches each photo and detects PNG vs JPG from the bytes", async () => {
    const photos = [
      { url: "https://x/a.png", mimeType: "image/png", description: "Kitchen leak" },
      { url: "https://x/b.jpg", mimeType: "image/jpeg", description: "Ceiling stain" },
    ];
    const fetchImpl = fakeFetch({
      "https://x/a.png": PNG_SIG,
      "https://x/b.jpg": JPG_SIG,
    });

    const imgs = await inspectionPhotosToImages(photos, fetchImpl as never);

    expect(imgs).toHaveLength(2);
    expect(imgs[0].isPng).toBe(true);
    expect(imgs[1].isPng).toBe(false);
    expect(imgs[0].caption).toBe("Kitchen leak");
  });

  it("prefers thumbnailUrl over url to bound embedded size", async () => {
    const photos = [
      { url: "https://x/full.jpg", thumbnailUrl: "https://x/thumb.jpg" },
    ];
    const fetchImpl = fakeFetch({ "https://x/thumb.jpg": JPG_SIG });

    const imgs = await inspectionPhotosToImages(photos, fetchImpl as never);

    expect(imgs).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith("https://x/thumb.jpg");
    expect(fetchImpl).not.toHaveBeenCalledWith("https://x/full.jpg");
  });

  it("resolves caption description → location → roomType → empty", async () => {
    const photos = [
      { url: "https://x/1", location: "Master bedroom" },
      { url: "https://x/2", roomType: "BATHROOM" },
      { url: "https://x/3" },
    ];
    const fetchImpl = fakeFetch({
      "https://x/1": JPG_SIG,
      "https://x/2": JPG_SIG,
      "https://x/3": JPG_SIG,
    });

    const imgs = await inspectionPhotosToImages(photos, fetchImpl as never);

    expect(imgs.map((i) => i.caption)).toEqual([
      "Master bedroom",
      "BATHROOM",
      "",
    ]);
  });

  it("skips a photo with no usable url and one whose fetch fails", async () => {
    const photos = [
      { url: "" },
      { url: "https://x/ok", description: "good" },
      { url: "https://x/broken", description: "bad" },
    ];
    const fetchImpl = fakeFetch({
      "https://x/ok": PNG_SIG,
      "https://x/broken": "fail",
    });

    const imgs = await inspectionPhotosToImages(photos, fetchImpl as never);

    expect(imgs.map((i) => i.caption)).toEqual(["good"]);
  });

  it("returns [] for empty input", async () => {
    expect(await inspectionPhotosToImages([], fakeFetch({}) as never)).toEqual([]);
  });
});
