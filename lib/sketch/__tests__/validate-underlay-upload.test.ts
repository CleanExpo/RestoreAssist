import { describe, it, expect } from "vitest";
import {
  validateUnderlayUpload,
  MAX_UNDERLAY_BYTES,
} from "../validate-underlay-upload";

describe("validateUnderlayUpload", () => {
  it("accepts PNG, JPEG and WebP within the size cap", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(validateUnderlayUpload({ type, size: 1024 })).toEqual({ ok: true });
    }
  });

  it("rejects a disallowed type with a helpful message", () => {
    const r = validateUnderlayUpload({ type: "application/pdf", size: 1024 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/PNG|JPG|WebP/i);
  });

  it("rejects a GIF (not in the allow-list)", () => {
    expect(validateUnderlayUpload({ type: "image/gif", size: 1024 }).ok).toBe(false);
  });

  it("rejects a file over the size cap", () => {
    const r = validateUnderlayUpload({
      type: "image/png",
      size: MAX_UNDERLAY_BYTES + 1,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/large|MB|size/i);
  });

  it("accepts a file exactly at the cap (boundary)", () => {
    expect(
      validateUnderlayUpload({ type: "image/png", size: MAX_UNDERLAY_BYTES }),
    ).toEqual({ ok: true });
  });
});
