/**
 * Regression guard — IICRC S500 citations carry the edition year (RA-6793 follow-up).
 *
 * CLAUDE.md rule #12 requires IICRC citations in full form, e.g. `IICRC S500:2021 §12.7.1`.
 * RA-6793 standardised `S500_FIELD_MAP` to the `S500:2021 §X` form and added a guard
 * (see nir-standards-mapping.test.ts). Several hardcoded citation *data* strings still
 * shipped the legacy year-less `S500 §X` form — including into report scope items,
 * the tiered-completion field map, the jurisdictional matrix, and the Guidewire insurer
 * payload. This test locks the year onto the structured citation fields that flow into
 * generated reports and external claim payloads, so a new legacy-form citation can't
 * silently regress.
 *
 * Scope note: only the machine-consumed citation FIELDS are asserted (clauseRef /
 * regulationRef / standardRef). Free-text `rationale`/`condition` prose is intentionally
 * left out of scope.
 */
import { describe, it, expect } from "vitest";
import {
  CRITICAL_FIELDS,
  SUPPLEMENTARY_FIELDS,
} from "@/lib/nir-tiered-completion";
import {
  JURISDICTIONAL_MATRIX,
  NZ_JURISDICTIONAL_MATRIX,
} from "@/lib/nir-jurisdictional-matrix";

/**
 * The legacy year-less form: "S500" directly followed by a space and the section
 * symbol, with no `:2021` edition marker in between. Matches both `IICRC S500 §X`
 * and bare `S500 §X`.
 */
const LEGACY_YEARLESS_S500 = /S500 §/;

describe("IICRC S500 citations carry the :2021 edition year", () => {
  it("every tiered-completion clauseRef that cites S500 includes the edition year", () => {
    const clauseRefs = [...CRITICAL_FIELDS, ...SUPPLEMENTARY_FIELDS]
      .map((f) => f.clauseRef)
      .filter((ref): ref is string => Boolean(ref) && ref!.includes("S500"));

    // Sanity: the fixture actually contains S500 clause refs to assert against.
    expect(clauseRefs.length).toBeGreaterThan(0);

    for (const ref of clauseRefs) {
      expect(ref, `${ref} must cite the S500:2021 edition`).not.toMatch(
        LEGACY_YEARLESS_S500,
      );
      expect(ref).toContain("S500:2021");
    }
  });

  it("no S500 regulationRef in either jurisdictional matrix uses the legacy year-less form", () => {
    const s500Refs = [
      ...collectStrings(JURISDICTIONAL_MATRIX),
      ...collectStrings(NZ_JURISDICTIONAL_MATRIX),
    ].filter((s) => s.includes("S500 §") || s.includes("S500:2021 §"));

    // Sanity: at least one S500 citation exists in the matrices.
    expect(s500Refs.length).toBeGreaterThan(0);

    for (const ref of s500Refs) {
      expect(ref, `${ref} must cite the S500:2021 edition`).not.toMatch(
        LEGACY_YEARLESS_S500,
      );
    }
  });
});

/**
 * Recursively collect every string leaf from an arbitrary data structure.
 * Used to future-proof the guard: a legacy citation added anywhere inside the
 * exported matrices is caught, not just at today's known field paths.
 */
function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}
