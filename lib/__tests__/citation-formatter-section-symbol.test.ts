/**
 * Tests for validateAGLC4Format § handling — lib/citation-formatter.ts
 *
 * RA-6793: the AGLC4 validator historically flagged the '§' symbol as invalid
 * for ALL citations. That conflicts with the IICRC mandate (CLAUDE.md rule #14)
 * to cite technical standards with '§' (e.g. 'S500:2021 §12.3'). The § rejection
 * is now scoped to AGLC4 *legal* citations only; standard references opt out via
 * { kind: "standard" }.
 */
import { describe, it, expect } from "vitest";
import { validateAGLC4Format } from "@/lib/citation-formatter";

describe("validateAGLC4Format — § symbol scoping (RA-6793)", () => {
  it("flags § for legal citations (default behaviour, unchanged)", () => {
    const result = validateAGLC4Format("Work Health and Safety Act 2011 (Cth) § 36");
    expect(result.isValid).toBe(false);
    expect(result.issues.some((i) => i.includes("§"))).toBe(true);
  });

  it("flags § for legal citations when kind is explicitly 'legal'", () => {
    const result = validateAGLC4Format("NCC 2025 § 3.2", { kind: "legal" });
    expect(result.isValid).toBe(false);
  });

  it("does NOT flag § for IICRC standard references (kind: 'standard')", () => {
    const result = validateAGLC4Format("S500:2021 §12.3", { kind: "standard" });
    expect(result.issues.some((i) => i.includes("§"))).toBe(false);
    expect(result.isValid).toBe(true);
  });

  it("still flags genuine format errors on standard references", () => {
    // Double space is a real issue regardless of citation kind.
    const result = validateAGLC4Format("S500:2021  §12.3", { kind: "standard" });
    expect(result.isValid).toBe(false);
    expect(result.issues.some((i) => i.includes("Double spaces"))).toBe(true);
  });
});
