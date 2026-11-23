import { describe, it, expect } from "vitest";
import {
  SIGNATURE_DATA_MAX_CHARS,
  SIGNATORY_NAME_MAX_CHARS,
  decodeSignatureForPdf,
  typedSignatureDataUrl,
  validateSignatoryName,
  validateSignatureData,
} from "../signature-format";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG_URL = `data:image/png;base64,${PNG_B64}`;

describe("signature-format (RA-8604)", () => {
  it("round-trips a typed signature: writer output passes the gate and decodes to the name", () => {
    const url = typedSignatureDataUrl("  Jane Homeowner ");
    expect(validateSignatureData(url)).toMatchObject({ ok: true, kind: "typed" });
    expect(decodeSignatureForPdf(url)).toEqual({
      ok: true,
      kind: "typed",
      name: "Jane Homeowner",
    });
  });

  it("strips markup characters from a typed name and falls back when empty", () => {
    const d = decodeSignatureForPdf(typedSignatureDataUrl(`<b>O'Neil & "Co"</b>`));
    expect(d).toEqual({ ok: true, kind: "typed", name: "bONeil  Co/b" });
    expect(decodeSignatureForPdf(typedSignatureDataUrl("<>"))).toMatchObject({
      name: "Signed",
    });
  });

  it("accepts a base64 PNG data URL and returns PNG bytes", () => {
    const d = validateSignatureData(PNG_URL);
    expect(d.ok && d.kind === "png" && d.bytes[1]).toBe(0x50);
  });

  it.each([
    ["empty", ""],
    ["not a string", 42],
    ["null", null],
    ["arbitrary text", "hello"],
    ["loose svg shape", "data:image/svg+xml;utf8,x"],
    ["foreign svg", `data:image/svg+xml;utf8,${encodeURIComponent("<svg onload=alert(1)></svg>")}`],
    ["base64 svg", "data:image/svg+xml;base64,PHN2Zy8+"],
    ["jpeg", "data:image/jpeg;base64,/9j/4AAQ"],
    ["png prefix, not base64", "data:image/png;base64,***"],
    ["png prefix, not a png", "data:image/png;base64,aGVsbG8gd29ybGQ="],
    ["bare base64 on write", PNG_B64],
    ["oversize", "data:image/png;base64," + "A".repeat(SIGNATURE_DATA_MAX_CHARS)],
  ])("gate rejects %s", (_label, value) => {
    expect(validateSignatureData(value).ok).toBe(false);
  });

  it("reader tolerates a legacy bare-base64 PNG row", () => {
    expect(decodeSignatureForPdf(PNG_B64)).toMatchObject({ ok: true, kind: "png" });
  });

  it("validates the optional signatory name", () => {
    expect(validateSignatoryName(undefined)).toEqual({ ok: true, name: undefined });
    expect(validateSignatoryName("  ")).toEqual({ ok: true, name: undefined });
    expect(validateSignatoryName(" Jane ")).toEqual({ ok: true, name: "Jane" });
    expect(validateSignatoryName({}).ok).toBe(false);
    expect(validateSignatoryName("a\nb").ok).toBe(false);
    expect(validateSignatoryName("x".repeat(SIGNATORY_NAME_MAX_CHARS + 1)).ok).toBe(false);
  });
});
