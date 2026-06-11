import { describe, it, expect } from "vitest";
import { typedSignatureDataUrl } from "../typed-signature";

describe("typedSignatureDataUrl", () => {
  it("produces an svg image data URL containing the name", () => {
    const url = typedSignatureDataUrl("Jane Client");
    expect(url.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    expect(decodeURIComponent(url)).toContain("Jane Client");
  });

  it("strips markup-significant chars (no injection into the SVG)", () => {
    const url = decodeURIComponent(typedSignatureDataUrl('<script>"x"'));
    expect(url).not.toContain("<script>");
    expect(url).not.toContain('"x"');
  });

  it("falls back to 'Signed' on an empty name", () => {
    expect(decodeURIComponent(typedSignatureDataUrl("   "))).toContain(
      ">Signed<",
    );
  });
});
