import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  computeRasterScale,
  UNDERLAY_RASTER_TARGET_WIDTH,
} from "../pdf-to-raster";

// RA-6849 [C3]: only the pure scale math is unit-tested here — the actual
// pdfjs render path needs a DOM + worker and is exercised on-device / in CI.
describe("computeRasterScale", () => {
  it("scales a narrow page up toward the target width", () => {
    // 800px natural → target 1600 wants 2x, within the [0.5, 4] clamp.
    expect(computeRasterScale(800, 1600)).toBe(2);
  });

  it("scales a wide page down toward the target width", () => {
    // 3200px natural → target 1600 wants 0.5x (at the min-scale floor).
    expect(computeRasterScale(3200, 1600)).toBe(0.5);
  });

  it("clamps to MAX_SCALE for a tiny page", () => {
    // 100px natural → raw 16x, clamped to 4.
    expect(computeRasterScale(100, 1600)).toBe(4);
  });

  it("clamps to MIN_SCALE for a huge page", () => {
    // 10000px natural → raw 0.16x, clamped to 0.5.
    expect(computeRasterScale(10000, 1600)).toBe(0.5);
  });

  it("returns 1 for a non-positive page width", () => {
    expect(computeRasterScale(0)).toBe(1);
    expect(computeRasterScale(-100)).toBe(1);
    expect(computeRasterScale(Number.NaN)).toBe(1);
  });

  it("defaults to UNDERLAY_RASTER_TARGET_WIDTH", () => {
    // At exactly the default target width, scale is 1 (no resample needed).
    expect(computeRasterScale(UNDERLAY_RASTER_TARGET_WIDTH)).toBe(1);
  });
});

// RA-8236: explicit page-1-only contract and encrypted-PDF classification.
describe("pdfFirstPageToPng (RA-8236)", () => {
  const getPage = vi.fn();
  const getDocument = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    getPage.mockReset().mockResolvedValue({
      getViewport: () => ({ width: 800, height: 600 }),
      render: () => ({ promise: Promise.resolve() }),
    });
    getDocument.mockReset();
    vi.doMock("pdfjs-dist", () => ({
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument,
    }));
    vi.stubGlobal("document", {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({}),
        toDataURL: () => "data:image/png;base64,cGFnZQ==",
      }),
    });
  });

  afterEach(() => {
    vi.doUnmock("pdfjs-dist");
    vi.unstubAllGlobals();
  });

  const pdf = () => new Blob([new Uint8Array(4)], { type: "application/pdf" });

  it("renders page 1 only and reports the page count", async () => {
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 5, getPage }),
    });
    const { pdfFirstPageToPng } = await import("../pdf-to-raster");
    const result = await pdfFirstPageToPng(pdf());
    expect(result).toEqual({
      dataUrl: "data:image/png;base64,cGFnZQ==",
      pageCount: 5,
    });
    expect(getPage).toHaveBeenCalledTimes(1);
    expect(getPage).toHaveBeenCalledWith(1);
  });

  it("classifies a password-protected PDF as encrypted", async () => {
    getDocument.mockImplementation(() => ({
      promise: Promise.reject(
        Object.assign(new Error("No password given"), {
          name: "PasswordException",
        }),
      ),
    }));
    const { pdfFirstPageToPng, PdfUnderlayError } = await import(
      "../pdf-to-raster"
    );
    const failure = await pdfFirstPageToPng(pdf()).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(PdfUnderlayError);
    expect((failure as { code: string }).code).toBe("encrypted");
  });

  it("classifies a damaged PDF as unreadable", async () => {
    getDocument.mockImplementation(() => ({
      promise: Promise.reject(new Error("Invalid PDF structure")),
    }));
    const { pdfFirstPageToPng } = await import("../pdf-to-raster");
    const failure = await pdfFirstPageToPng(pdf()).catch((e: unknown) => e);
    expect((failure as { code: string }).code).toBe("unreadable");
  });
});
