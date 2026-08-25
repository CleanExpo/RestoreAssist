/**
 * UNI-2619 — the enhanced-report prompt must not name a jurisdiction-specific
 * instrument, because it receives no jurisdiction.
 *
 * `GenerateEnhancedInput` carries no state, postcode or country. The prompt
 * nevertheless used to hardcode "Work Health and Safety Act 2011 (Commonwealth)",
 * a QLD example WHS Act, and "Queensland Development Code (QDC) - specifically
 * QDC 4.5" for every job in every jurisdiction.
 *
 * The first fix replaced the standards block but left four CRITICAL INSTRUCTIONS
 * lines still commanding the model to cite "Work Health and Safety Act 2011" and
 * "QDC 4.5" by name — a self-contradicting prompt in which the later imperative
 * would probably win. A reviewer caught that, not a test.
 *
 * This test exists so the next partial sweep fails in CI instead. It asserts on
 * the WHOLE prompt, so a forbidden instrument reintroduced ANYWHERE in the file
 * is caught, not just in the block someone remembered to look at.
 */
import { describe, expect, it } from "vitest";
import { buildPrompt } from "@/lib/services/ai/generate-enhanced-report";

/**
 * Instruments that name a specific jurisdiction. None can be justified in a
 * prompt with no jurisdiction input. National and international standards
 * (NCC, AS/NZS, ANSI/IICRC) are deliberately NOT here — they apply everywhere
 * and naming them is correct.
 */
const JURISDICTION_SPECIFIC = [
  /Work Health and Safety Act\s+\d{4}/i,
  /Occupational Health and Safety Act\s+\d{4}/i,
  /Health and Safety at Work Act\s+\d{4}/i,
  /Queensland Development Code/i,
  /\bQDC\b/,
  /Environmental Protection Act\s+\d{4}/i,
];

function prompt(): string {
  return buildPrompt({
    technicianNotes: "Water damage to ground floor. Extraction completed.",
    technicianName: "Test Technician",
    propertyAddress: "1 Test St",
  });
}

describe("enhanced-report prompt names no jurisdiction-specific instrument", () => {
  it("builds a prompt at all", () => {
    // Positive control. Without it, a builder returning "" would satisfy every
    // negative assertion below and the suite would be worthless.
    const p = prompt();
    expect(p.length).toBeGreaterThan(500);
    expect(p).toContain("ANSI/IICRC S500:2021");
  });

  it.each(JURISDICTION_SPECIFIC)("does not name %s anywhere", (pattern) => {
    const p = prompt();
    const hit = p.match(pattern);
    expect(
      hit,
      hit ? `prompt names "${hit[0]}" but receives no jurisdiction` : "",
    ).toBeNull();
  });

  it("still instructs on WHS and building codes generically", () => {
    // The fix must not have simply deleted the subject matter — that would
    // trade a wrong citation for a report that ignores safety entirely.
    const p = prompt();
    expect(p).toMatch(/work health and safety/i);
    expect(p).toMatch(/National Construction Code|NCC/);
    expect(p).toMatch(/Safe Work Australia/i);
  });

  it("tells the model not to invent an instrument", () => {
    const p = prompt();
    expect(p).toMatch(/Do NOT name any Act, year or jurisdiction unless it appears verbatim/);
  });
});
