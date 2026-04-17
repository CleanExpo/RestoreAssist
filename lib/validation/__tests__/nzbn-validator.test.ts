/**
 * Unit tests for NZBN (New Zealand Business Number) validator.
 *
 * A known-valid NZBN is generated algorithmically so the test does not
 * depend on any single real-world organisation's identifier. The computed
 * check digit uses the GS1 GLN / EAN-13 algorithm.
 */

import { validateNZBN, normalizeNZBN } from "../nzbn-validator";

/**
 * Compute the GS1 mod-10 check digit for a 12-digit prefix. Mirrors the
 * implementation under test so the test case is derived transparently.
 */
function computeCheckDigit(prefix12: string): number {
  if (!/^\d{12}$/.test(prefix12)) {
    throw new Error("prefix must be exactly 12 digits");
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(prefix12[i]);
    const weight = i % 2 === 0 ? 1 : 3;
    sum += digit * weight;
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

describe("NZBN validator", () => {
  // Build a valid NZBN from a deterministic 12-digit prefix.
  const prefix = "942903123456";
  const checkDigit = computeCheckDigit(prefix);
  const validNZBN = `${prefix}${checkDigit}`;

  describe("validateNZBN", () => {
    it("accepts a known-valid 13-digit NZBN", () => {
      const result = validateNZBN(validNZBN);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("accepts the same NZBN after whitespace padding", () => {
      const result = validateNZBN(`  ${validNZBN}  `);
      expect(result.valid).toBe(true);
    });

    it("rejects an NZBN with a wrong check digit", () => {
      const wrongCheckDigit = (checkDigit + 1) % 10;
      const invalid = `${prefix}${wrongCheckDigit}`;
      const result = validateNZBN(invalid);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/checksum/i);
    });

    it("rejects an NZBN that is too short", () => {
      const result = validateNZBN("9429031234");
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/13 digits/);
    });

    it("rejects an NZBN that is too long", () => {
      const result = validateNZBN("94290312345678");
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/13 digits/);
    });

    it("rejects an NZBN containing non-numeric characters", () => {
      const result = validateNZBN("9429O31234567"); // letter O, not zero
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/digits only/i);
    });

    it("rejects an empty string", () => {
      const result = validateNZBN("");
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/required/i);
    });

    it("rejects a whitespace-only string", () => {
      const result = validateNZBN("     ");
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/required/i);
    });
  });

  describe("normalizeNZBN", () => {
    it("strips leading and trailing whitespace", () => {
      expect(normalizeNZBN("  9429031234566  ")).toBe("9429031234566");
    });

    it("strips internal whitespace (spaces, tabs, newlines)", () => {
      expect(normalizeNZBN("9429 0312\t3456\n6")).toBe("9429031234566");
    });

    it("returns an empty string for empty input", () => {
      expect(normalizeNZBN("")).toBe("");
    });

    it("returns an empty string for non-string input", () => {
      // Defensive: some callers pass through unknown values.
      expect(normalizeNZBN(undefined as unknown as string)).toBe("");
      expect(normalizeNZBN(null as unknown as string)).toBe("");
    });
  });
});
