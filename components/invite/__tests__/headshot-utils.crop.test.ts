// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { squareCropToDataUrl } from "../headshot-utils";

// Tiny valid-looking JPEG blob (content doesn't actually need to decode for
// this test — the Image stub below resolves synchronously). This mirrors the
// fixture shape used by the invite E2E spec.
function tinyJpegFile(): File {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  return new File([bytes], "headshot.jpg", { type: "image/jpeg" });
}

const realImage = globalThis.Image;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.Image = realImage;
});

describe("squareCropToDataUrl fallback path", () => {
  it("falls back to <img>+canvas when createImageBitmap rejects", async () => {
    // Force the primary path to fail (simulates headless Chromium choking on
    // a 1×1 JPEG, which is the Seam A failure we are fixing).
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("decode failed")),
    );

    // Stub URL.createObjectURL / revokeObjectURL — jsdom's defaults work
    // but assigning them keeps the test self-contained.
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    // Stub Image so .src assignment fires onload synchronously with known
    // dimensions. Avoids depending on jsdom's image decoder.
    class StubImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 100;
      height = 80;
      // eslint-disable-next-line accessor-pairs
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    // @ts-expect-error — assigning a minimal stub for the test
    globalThis.Image = StubImage;

    // Stub canvas getContext + toDataURL — jsdom canvas isn't backed by a
    // real renderer, so toDataURL would otherwise return an empty PNG.
    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => "data:image/jpeg;base64,FAKEBASE64");
    const getContext = vi.fn(() => ({ drawImage }));
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(
      ((tag: string) => {
        if (tag === "canvas") {
          return {
            width: 0,
            height: 0,
            getContext,
            toDataURL,
          } as unknown as HTMLCanvasElement;
        }
        return realCreateElement(tag);
      }) as typeof document.createElement,
    );

    const dataUrl = await squareCropToDataUrl(tinyJpegFile(), 256);

    expect(dataUrl).toBe("data:image/jpeg;base64,FAKEBASE64");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.9);
  });

  it("propagates a decode error when both primary and fallback fail", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("decode failed")),
    );

    class StubImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      // eslint-disable-next-line accessor-pairs
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    // @ts-expect-error — assigning a minimal stub for the test
    globalThis.Image = StubImage;

    await expect(squareCropToDataUrl(tinyJpegFile(), 256)).rejects.toThrow(
      /Failed to decode image/,
    );
  });
});
