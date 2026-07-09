/**
 * Regression guard — the generated-PDF report footer cites the CURRENT IICRC
 * editions (RA follow-up to the S520/S700 edition-drift fix).
 *
 * CLAUDE.md rule #12 requires IICRC citations to carry the correct edition. The
 * insurer-facing report footer once hard-coded "S520 3rd Ed, S700 2nd Ed", which
 * drifted out of sync with the STANDARDS_VERSIONS single source of truth after the
 * S520 4th-edition (2024) and S700 1st-edition (2025) registry updates.
 *
 * `reportStandardsFooterLine()` now derives the footer entirely from
 * STANDARDS_VERSIONS. This test locks that derivation so a future edition bump to
 * the registry can't silently leave the footer (or the Guidewire insurer payload,
 * which shares `standardEdition`) stale.
 */
import { describe, it, expect } from "vitest";
import {
  STANDARDS_VERSIONS,
  standardEdition,
  reportStandardsFooterLine,
} from "@/lib/nir-standards-mapping";

describe("report footer standards line tracks STANDARDS_VERSIONS", () => {
  it("never ships the stale S520 3rd / S700 2nd edition literals", () => {
    const line = reportStandardsFooterLine();
    expect(line).not.toMatch(/S520 3rd/);
    expect(line).not.toMatch(/S700 2nd/);
  });

  it("reflects the S500/S520/S700/NCC editions from the registry", () => {
    const line = reportStandardsFooterLine();

    // S500 keeps the year-form citation ("S500:2021").
    expect(line).toContain(`S500:${STANDARDS_VERSIONS.S500.year}`);

    // S520 + S700 carry the registry edition + year, so a 4th-ed/1st-ed bump
    // flows through automatically instead of hard-coding "3rd"/"2nd".
    expect(line).toContain(
      `S520 ${STANDARDS_VERSIONS.S520.edition} Ed (${STANDARDS_VERSIONS.S520.year})`,
    );
    expect(line).toContain(
      `S700 ${STANDARDS_VERSIONS.S700.edition} Ed (${STANDARDS_VERSIONS.S700.year})`,
    );

    // NCC uses its formal designation ("NCC 2022").
    expect(line).toContain(STANDARDS_VERSIONS.NCC.designation);
  });

  it("today's registry resolves to the known-correct footer string", () => {
    // Pins current expected output; updates in lockstep with an intentional
    // registry edition bump, but fails loudly if the derivation regresses.
    expect(reportStandardsFooterLine()).toBe(
      "IICRC S500:2021, S520 4th Ed (2024), S700 1st Ed (2025), NCC 2022",
    );
  });
});

describe("standardEdition derives edition labels from the registry", () => {
  it("renders ordinal editions as '<edition> Ed' for IICRC standards", () => {
    expect(standardEdition("S500")).toBe("5th Ed");
    expect(standardEdition("S520")).toBe("4th Ed");
    expect(standardEdition("S700")).toBe("1st Ed");
  });

  it("returns NCC's year-style label without an 'Ed' suffix", () => {
    expect(standardEdition("NCC")).toBe("2022");
  });
});
