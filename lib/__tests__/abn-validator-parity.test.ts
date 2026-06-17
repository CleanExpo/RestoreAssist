/**
 * ABN validator de-duplication parity — RA-6793
 *
 * Two ABN checksum validators historically existed:
 *   - lib/abn/checksum.ts  → isValidAbn  (canonical)
 *   - lib/sanitize.ts      → isValidABN  (legacy export name)
 *
 * isValidABN now delegates to isValidAbn so the mod-89 logic cannot drift.
 * This test pins both names to identical behaviour across valid, invalid-checksum,
 * malformed, and non-string inputs.
 */
import { describe, it, expect } from "vitest";
import { isValidAbn } from "@/lib/abn/checksum";
import { isValidABN } from "@/lib/sanitize";

const CASES: Array<{ input: unknown; expected: boolean; note: string }> = [
  { input: "53004085616", expected: true, note: "valid ABN" },
  { input: "53 004 085 616", expected: true, note: "valid ABN with spaces" },
  { input: "53004085617", expected: false, note: "invalid checksum" },
  { input: "1234567890", expected: false, note: "10 digits" },
  { input: "123456789012", expected: false, note: "12 digits" },
  { input: "5300408561A", expected: false, note: "non-digit char" },
  { input: "", expected: false, note: "empty string" },
];

describe("ABN validator parity (isValidABN delegates to isValidAbn)", () => {
  for (const { input, expected, note } of CASES) {
    it(`agrees for ${note}`, () => {
      expect(isValidAbn(input as string)).toBe(expected);
      expect(isValidABN(input)).toBe(expected);
      expect(isValidABN(input)).toBe(isValidAbn(input as string));
    });
  }

  it("isValidABN returns false for non-string inputs without throwing", () => {
    expect(isValidABN(null)).toBe(false);
    expect(isValidABN(undefined)).toBe(false);
    expect(isValidABN(53004085616)).toBe(false);
    expect(isValidABN({})).toBe(false);
  });
});
