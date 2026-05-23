import { describe, expect, it } from "vitest";
import { validateHeadshotFile } from "../headshot-utils";

function mockFile(opts: { name: string; type: string; size: number }): File {
  const blob = new Blob([new Uint8Array(opts.size)], { type: opts.type });
  return new File([blob], opts.name, { type: opts.type });
}

describe("validateHeadshotFile", () => {
  it("accepts a JPEG under 5MB", () => {
    const f = mockFile({ name: "me.jpg", type: "image/jpeg", size: 1_000_000 });
    expect(validateHeadshotFile(f)).toEqual({ ok: true });
  });

  it("accepts a PNG under 5MB", () => {
    const f = mockFile({ name: "me.png", type: "image/png", size: 4_000_000 });
    expect(validateHeadshotFile(f)).toEqual({ ok: true });
  });

  it("rejects a HEIC file", () => {
    const f = mockFile({ name: "me.heic", type: "image/heic", size: 1_000_000 });
    const result = validateHeadshotFile(f);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/JPG or PNG/);
    }
  });

  it("rejects a non-image", () => {
    const f = mockFile({ name: "doc.pdf", type: "application/pdf", size: 1_000_000 });
    const result = validateHeadshotFile(f);
    expect(result.ok).toBe(false);
  });

  it("rejects a file over 5MB", () => {
    const f = mockFile({ name: "big.jpg", type: "image/jpeg", size: 6_000_000 });
    const result = validateHeadshotFile(f);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/under 5\s?MB/);
    }
  });

  it("rejects an empty file", () => {
    const f = mockFile({ name: "empty.jpg", type: "image/jpeg", size: 0 });
    const result = validateHeadshotFile(f);
    expect(result.ok).toBe(false);
  });
});
