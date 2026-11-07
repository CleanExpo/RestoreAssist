import { describe, expect, it } from "vitest";
import {
  STRICT_UPLOAD_POLICY,
  validateImageUploadStrict,
} from "../validate-image-upload";
import {
  makeJpeg,
  makeJpegWithoutScan,
  makePng,
  makePngWithoutIdat,
  makeWebp,
  makeWebpCanvasOnly,
} from "./image-fixtures";

const allowed = ["image/png", "image/jpeg", "image/webp"] as const;
const check = (declaredType: string, buffer: Buffer) =>
  validateImageUploadStrict({ declaredType, buffer, allowedTypes: allowed });

describe("strict upload policy", () => {
  it("states its limits explicitly", () => {
    expect(STRICT_UPLOAD_POLICY).toEqual({
      maxBytes: 10 * 1024 * 1024,
      maxPixels: 40_000_000,
      maxDimension: 10_000,
    });
  });

  it.each([
    ["image/png", makePng(30, 20), 30, 20],
    ["image/jpeg", makeJpeg(30, 20), 30, 20],
    ["image/webp", makeWebp(30, 20), 30, 20],
  ])(
    "accepts a genuine %s and reports dimensions",
    (type, buf, width, height) => {
      expect(check(type, buf)).toEqual({
        ok: true,
        mediaType: type,
        width,
        height,
      });
    },
  );

  it("canonicalises image/jpg", () => {
    expect(check("image/jpg", makeJpeg())).toMatchObject({
      ok: true,
      mediaType: "image/jpeg",
    });
  });

  it("rejects HTML renamed .png", () => {
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    expect(check("image/png", html)).toMatchObject({
      ok: false,
      reason: "unsupported-type",
    });
  });

  it("rejects a bare 4-byte magic spoof (no header)", () => {
    const spoof = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    expect(check("image/png", spoof)).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects a PNG signature followed by HTML", () => {
    const spoof = Buffer.concat([
      makePng().subarray(0, 8),
      Buffer.from("<html></html>"),
    ]);
    expect(check("image/png", spoof)).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects a truncated PNG", () => {
    const png = makePng(10, 10);
    expect(check("image/png", png.subarray(0, png.length - 12))).toMatchObject({
      ok: false,
      reason: "malformed",
    });
    expect(check("image/png", png.subarray(0, 40))).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects truncated JPEG and WebP", () => {
    const jpeg = makeJpeg();
    expect(
      check("image/jpeg", jpeg.subarray(0, jpeg.length - 2)),
    ).toMatchObject({ ok: false, reason: "malformed" });
    const webp = makeWebp();
    expect(
      check("image/webp", webp.subarray(0, webp.length - 3)),
    ).toMatchObject({ ok: false, reason: "malformed" });
  });

  it("tolerates trailing camera data after the JPEG end-of-image marker", () => {
    const withTrailer = Buffer.concat([makeJpeg(), Buffer.from("MPF-TRAILER")]);
    expect(check("image/jpeg", withTrailer)).toMatchObject({ ok: true });
  });

  it("rejects terminated files that lack the structure a decoder needs", () => {
    const png = makePngWithoutIdat();
    expect(png.length).toBe(45);
    expect(check("image/png", png)).toMatchObject({
      ok: false,
      reason: "malformed",
    });
    expect(check("image/jpeg", makeJpegWithoutScan())).toMatchObject({
      ok: false,
      reason: "malformed",
    });
    expect(check("image/webp", makeWebpCanvasOnly())).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects a declared MIME that differs from the sniffed type", () => {
    expect(check("image/png", makeJpeg())).toMatchObject({
      ok: false,
      reason: "mime-mismatch",
    });
    expect(check("image/jpeg", makeWebp())).toMatchObject({
      ok: false,
      reason: "mime-mismatch",
    });
    expect(check("image/webp", makePng())).toMatchObject({
      ok: false,
      reason: "mime-mismatch",
    });
  });

  it("rejects an undeclared or disallowed declared type", () => {
    expect(check("", makePng())).toMatchObject({
      ok: false,
      reason: "unsupported-type",
    });
    expect(check("image/gif", makePng())).toMatchObject({
      ok: false,
      reason: "unsupported-type",
    });
    expect(
      validateImageUploadStrict({
        declaredType: "image/webp",
        buffer: makeWebp(),
        allowedTypes: ["image/png"],
      }),
    ).toMatchObject({ ok: false, reason: "unsupported-type" });
  });

  it("rejects empty bodies", () => {
    expect(check("image/png", Buffer.alloc(0))).toMatchObject({
      ok: false,
      reason: "empty",
    });
  });

  it("counts real buffer bytes: over 10 MB is too-large regardless of any claimed size", () => {
    const big = Buffer.concat([
      makePng(),
      Buffer.alloc(STRICT_UPLOAD_POLICY.maxBytes),
    ]);
    expect(check("image/png", big)).toMatchObject({
      ok: false,
      reason: "too-large",
    });
  });

  it("rejects pixel bombs from the header, before any decode", () => {
    expect(check("image/png", makePng(100_000, 100_000))).toMatchObject({
      ok: false,
      reason: "pixel-bomb",
    });
    expect(check("image/png", makePng(9_999, 9_999))).toMatchObject({
      ok: false,
      reason: "pixel-bomb",
    });
    expect(check("image/jpeg", makeJpeg(20_000, 2))).toMatchObject({
      ok: false,
      reason: "pixel-bomb",
    });
    expect(check("image/webp", makeWebp(16_000, 16_000))).toMatchObject({
      ok: false,
      reason: "pixel-bomb",
    });
  });

  it("accepts the largest allowed image (inclusive cap)", () => {
    expect(check("image/png", makePng(8_000, 5_000))).toMatchObject({
      ok: true,
    });
  });

  it("rejects zero-sized dimensions", () => {
    expect(check("image/png", makePng(0, 10))).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });
});
