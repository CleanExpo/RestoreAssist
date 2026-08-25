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
