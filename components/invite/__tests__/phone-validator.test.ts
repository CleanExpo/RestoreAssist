import { describe, expect, it } from "vitest";
import { normaliseAuMobile, isValidAuMobile } from "../phone-validator";

describe("phone-validator", () => {
  describe("normaliseAuMobile", () => {
    it("strips spaces", () => {
      expect(normaliseAuMobile("0412 345 678")).toBe("0412345678");
    });
    it("converts +61 prefix to 0", () => {
      expect(normaliseAuMobile("+61 412 345 678")).toBe("0412345678");
    });
    it("converts +614 prefix to 04 without doubling", () => {
      expect(normaliseAuMobile("+61412345678")).toBe("0412345678");
    });
    it("trims trailing/leading whitespace", () => {
      expect(normaliseAuMobile("  0412345678  ")).toBe("0412345678");
    });
  });

  describe("isValidAuMobile", () => {
    it("accepts a normalised AU mobile", () => {
      expect(isValidAuMobile("0412345678")).toBe(true);
    });
    it("accepts a spaced AU mobile", () => {
      expect(isValidAuMobile("0412 345 678")).toBe(true);
    });
    it("accepts a +61-prefixed AU mobile", () => {
      expect(isValidAuMobile("+61 412 345 678")).toBe(true);
    });
    it("rejects an AU landline starting 03", () => {
      expect(isValidAuMobile("0312345678")).toBe(false);
    });
    it("rejects a 9-digit input", () => {
      expect(isValidAuMobile("041234567")).toBe(false);
    });
    it("rejects a US-style number", () => {
      expect(isValidAuMobile("+1 415 555 1234")).toBe(false);
    });
    it("rejects empty string", () => {
      expect(isValidAuMobile("")).toBe(false);
    });
  });
});
