// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compressImageForUpload,
  readExifOrientation,
} from "../image-compression";

/**
 * Builds a minimal JPEG byte sequence: SOI + an APP1/EXIF segment carrying
 * only the Orientation tag (0x0112) + EOI. Real camera JPEGs carry many more
 * tags, but the parser only reads this one, so this is a faithful fixture.
 */
function jpegWithOrientation(orientation: number): Uint8Array {
  const bytes = [
    0xff, 0xd8, // SOI
    0xff, 0xe1, // APP1 marker
    0x00, 0x22, // segment length = 34 (includes these 2 bytes)
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF header (little-endian, IFD @ 8)
    0x01, 0x00, // 1 IFD entry
    0x12, 0x01, // tag 0x0112 (Orientation)
    0x03, 0x00, // type SHORT
    0x01, 0x00, 0x00, 0x00, // count 1
    orientation, 0x00, 0x00, 0x00, // value
    0x00, 0x00, 0x00, 0x00, // next IFD offset
    0xff, 0xd9, // EOI
  ];
  return new Uint8Array(bytes);
}

function plainJpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
}

interface FakeBitmap {
  width: number;
  height: number;
  close: ReturnType<typeof vi.fn>;
}

function fakeBitmap(width: number, height: number): FakeBitmap {
  return { width, height, close: vi.fn() };
}

/** Installs a fake OffscreenCanvas that records constructor + transform calls. */
function stubOffscreenCanvas(resultBlob: Blob | null) {
  const transform = vi.fn();
  const drawImage = vi.fn();
  const convertToBlob = vi.fn().mockResolvedValue(resultBlob);
  const instances: Array<{ width: number; height: number }> = [];

  class FakeOffscreenCanvas {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
      instances.push({ width, height });
    }
    getContext() {
      return { transform, drawImage };
    }
    convertToBlob() {
      return convertToBlob();
    }
  }

  vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  return { transform, drawImage, convertToBlob, instances };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("compressImageForUpload", () => {
  it("downscales to the 2048px long edge and converts to WebP", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue(fakeBitmap(4096, 2048)),
    );
    const compressedBlob = new Blob([new Uint8Array(1000)], {
      type: "image/webp",
    });
    const { instances, convertToBlob } = stubOffscreenCanvas(compressedBlob);

    const input = new Blob([plainJpegBytes()], { type: "image/jpeg" });
    Object.defineProperty(input, "size", { value: 2_000_000 });

    const result = await compressImageForUpload(input);

    expect(instances[0]).toEqual({ width: 2048, height: 1024 });
    expect(convertToBlob).toHaveBeenCalledTimes(1);
    expect(result.skipped).toBe(false);
    expect(result.format).toBe("image/webp");
    expect(result.originalSize).toBe(2_000_000);
    expect(result.compressedSize).toBe(compressedBlob.size);
    expect(result.blob).toBe(compressedBlob);
  });

  it("falls back to HTMLCanvasElement when OffscreenCanvas is unavailable", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue(fakeBitmap(1024, 768)),
    );
    vi.stubGlobal("OffscreenCanvas", undefined);

    const compressedBlob = new Blob([new Uint8Array(500)], {
      type: "image/webp",
    });
    const drawImage = vi.fn();
    const transform = vi.fn();
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(compressedBlob));
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((
      tag: string,
    ) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage, transform }),
          toBlob,
        } as unknown as HTMLCanvasElement;
      }
      return realCreateElement(tag);
    }) as typeof document.createElement);

    const input = new Blob([plainJpegBytes()], { type: "image/png" });
    const result = await compressImageForUpload(input);

    expect(toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/webp",
      0.8,
    );
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(result.skipped).toBe(false);
    expect(result.blob).toBe(compressedBlob);
  });

  it("skips recompression for an already-small WebP", async () => {
    const createImageBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createImageBitmap);

    const input = new Blob([new Uint8Array(10)], { type: "image/webp" });
    Object.defineProperty(input, "size", { value: 100_000 }); // < 500KB

    const result = await compressImageForUpload(input);

    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(result.blob).toBe(input);
    expect(result.format).toBe("image/webp");
    expect(result.originalSize).toBe(100_000);
    expect(result.compressedSize).toBe(100_000);
  });

  it("re-compresses a WebP that is >= 500KB", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue(fakeBitmap(3000, 1000)),
    );
    const compressedBlob = new Blob([new Uint8Array(400_000)], {
      type: "image/webp",
    });
    stubOffscreenCanvas(compressedBlob);

    const input = new Blob([new Uint8Array(10)], { type: "image/webp" });
    Object.defineProperty(input, "size", { value: 600_000 }); // >= 500KB

    const result = await compressImageForUpload(input);

    expect(result.skipped).toBe(false);
    expect(result.compressedSize).toBe(compressedBlob.size);
  });

  it("applies the EXIF orientation transform before drawing (orientation 6 = rotate 90 CW)", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue(fakeBitmap(2000, 3000)),
    );
    const compressedBlob = new Blob([new Uint8Array(100)], {
      type: "image/webp",
    });
    const { instances, transform } = stubOffscreenCanvas(compressedBlob);

    const input = new Blob([jpegWithOrientation(6)], { type: "image/jpeg" });
    await compressImageForUpload(input);

    // longEdge 3000 > 2048 -> scale 2048/3000; drawWidth=1365, drawHeight=2048.
    // Orientation 6 swaps canvas dims relative to the raw bitmap.
    expect(instances[0]).toEqual({ width: 2048, height: 1365 });
    expect(transform).toHaveBeenCalledWith(0, 1, -1, 0, 2048, 0);
  });

  it("returns the original blob with skipped:true when the browser can't decode the input (e.g. HEIC)", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("decode failed")),
    );

    const input = new Blob([new Uint8Array([1, 2, 3])], {
      type: "image/heic",
    });
    Object.defineProperty(input, "size", { value: 3_000_000 });

    const result = await compressImageForUpload(input);

    expect(result.skipped).toBe(true);
    expect(result.blob).toBe(input);
    expect(result.format).toBe("image/heic");
    expect(result.compressedSize).toBe(3_000_000);
  });

  it("returns the original blob unchanged for non-image input", async () => {
    const createImageBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createImageBitmap);

    const input = new Blob([new Uint8Array([1, 2, 3])], {
      type: "application/pdf",
    });
    const result = await compressImageForUpload(input);

    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(result.blob).toBe(input);
    expect(result.format).toBe("application/pdf");
  });
});

describe("readExifOrientation", () => {
  it("returns 1 for a JPEG with no EXIF segment", async () => {
    const blob = new Blob([plainJpegBytes()], { type: "image/jpeg" });
    expect(await readExifOrientation(blob)).toBe(1);
  });

  it("returns 1 for a non-JPEG blob", async () => {
    const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
      type: "image/png",
    });
    expect(await readExifOrientation(blob)).toBe(1);
  });

  it("reads the orientation tag out of the EXIF segment", async () => {
    const blob = new Blob([jpegWithOrientation(6)], { type: "image/jpeg" });
    expect(await readExifOrientation(blob)).toBe(6);
  });

  it("reads a different orientation value correctly", async () => {
    const blob = new Blob([jpegWithOrientation(3)], { type: "image/jpeg" });
    expect(await readExifOrientation(blob)).toBe(3);
  });
});
