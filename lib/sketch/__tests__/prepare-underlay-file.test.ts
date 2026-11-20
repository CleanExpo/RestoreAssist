import { describe, expect, it, vi, beforeEach } from "vitest";
import { prepareUnderlayFile } from "../prepare-underlay-file";

vi.mock("../underlay-watermark", () => ({
  watermarkImageDataUrl: vi.fn(async (src: string) => `watermarked:${src}`),
}));

function makeFile(type: string, size = 128, name = "plan.png"): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe("prepareUnderlayFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unsupported types before any read", async () => {
    const result = await prepareUnderlayFile(makeFile("image/gif", 80, "x.gif"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/PNG, JPG, WebP|PDF/i);
    }
  });

  it("rejects oversized files", async () => {
    const result = await prepareUnderlayFile(
      makeFile("image/png", 11 * 1024 * 1024),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/too large/i);
    }
  });
});

// RA-8236: the server owns the single baked watermark and the page-1 contract.
const pdfMock = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("../pdf-to-raster", async (original) => ({
  ...(await original<typeof import("../pdf-to-raster")>()),
  pdfFirstPageToPng: pdfMock.render,
}));

describe("prepareUnderlayFile (RA-8236)", () => {
  class FakeReader {
    result = "data:image/webp;base64,d2VicA==";
    onload: (() => void) | null = null;
    readAsDataURL() {
      this.onload?.();
    }
  }

  beforeEach(async () => {
    const { watermarkImageDataUrl } = await import("../underlay-watermark");
    vi.mocked(watermarkImageDataUrl).mockImplementation(
      async (src: string) => `watermarked:${src}`,
    );
    pdfMock.render.mockReset();
    vi.stubGlobal("FileReader", FakeReader);
  });

  it("uploads an unmarked WebP and watermarks only the preview", async () => {
    const result = await prepareUnderlayFile(makeFile("image/webp"));
    expect(result).toMatchObject({
      ok: true,
      dataUrl: "data:image/webp;base64,d2VicA==",
      previewUrl: "watermarked:data:image/webp;base64,d2VicA==",
      original: { mimeType: "image/webp", page: null, pageCount: null },
    });
  });

  it("uploads the unmarked page 1 raster of a PDF", async () => {
    pdfMock.render.mockResolvedValue({
      dataUrl: "data:image/png;base64,cGFnZQ==",
      pageCount: 1,
    });
    const result = await prepareUnderlayFile(makeFile("application/pdf"));
    expect(result).toMatchObject({
      ok: true,
      dataUrl: "data:image/png;base64,cGFnZQ==",
      previewUrl: "watermarked:data:image/png;base64,cGFnZQ==",
      original: { mimeType: "application/pdf", page: 1, pageCount: 1 },
    });
  });

  it("states the page 1 limit for a multi-page PDF", async () => {
    pdfMock.render.mockResolvedValue({
      dataUrl: "data:image/png;base64,cGFnZQ==",
      pageCount: 3,
    });
    const result = await prepareUnderlayFile(makeFile("application/pdf"));
    expect(result.ok && result.notice).toMatch(/only page 1 of this 3-page PDF/i);
  });

  it("gives password-protected PDFs an actionable fallback", async () => {
    const { PdfUnderlayError } = await import("../pdf-to-raster");
    pdfMock.render.mockRejectedValue(new PdfUnderlayError("encrypted"));
    const result = await prepareUnderlayFile(makeFile("application/pdf"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/password/i);
      expect(result.error).toMatch(/export page 1 as a PNG or JPG/i);
      expect(result.error).toMatch(/draw the rooms by hand/i);
    }
  });

  it("gives unreadable PDFs an actionable fallback", async () => {
    pdfMock.render.mockRejectedValue(new Error("bad xref"));
    const result = await prepareUnderlayFile(makeFile("application/pdf"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/export page 1 as a PNG or JPG/i);
      expect(result.error).toMatch(/draw the rooms by hand/i);
    }
  });
});
