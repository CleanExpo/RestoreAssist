import { describe, expect, it } from "vitest";
import { validateImageUploadDecoded } from "../decode-check";
import {
  genuineImage,
  makePng,
  makePngWithGarbageIdat,
} from "./image-fixtures";

const allowed = ["image/png", "image/jpeg", "image/webp"] as const;
const check = (declaredType: string, buffer: Buffer) =>
  validateImageUploadDecoded({ declaredType, buffer, allowedTypes: allowed });

describe("decoded upload check", () => {
  it.each(["png", "jpeg", "webp"] as const)(
    "accepts a decoder-valid %s",
    async (format) => {
      const img = await genuineImage(format, 40, 30);
      expect(await check(`image/${format}`, img)).toEqual({
        ok: true,
        mediaType: `image/${format}`,
        width: 40,
        height: 30,
      });
    },
  );

  it("rejects a header-valid PNG whose pixel data cannot be decoded", async () => {
    expect(await check("image/png", makePngWithGarbageIdat())).toEqual({
      ok: false,
      reason: "undecodable",
    });
  });

  it("rejects a header-valid PNG whose IDAT is too short for its dimensions", async () => {
    expect(await check("image/png", makePng(30, 20))).toEqual({
      ok: false,
      reason: "undecodable",
    });
  });

  it("still refuses a pixel bomb from the header, without decoding", async () => {
    expect(await check("image/png", makePng(100_000, 100_000))).toEqual({
      ok: false,
      reason: "pixel-bomb",
    });
  });
});
