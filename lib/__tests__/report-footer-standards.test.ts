/**
 * Regression guard — the generated-PDF report footer cites the standards that
 * actually govern the job.
 *
 * Two defects this locks shut, both of which shipped on every report:
 *   1. "NCC 2022" printed on New Zealand reports. NZ has no National Construction
 *      Code; it is governed by the New Zealand Building Code.
 *   2. "NCC 2022" printed on Australian reports regardless of state or date, after
 *      Amendment 2 (29/07/2025) superseded it nationally and ACT/TAS/VIC/WA adopted
 *      NCC 2025 (01/05/2026).
 *
 * The original guard (CLAUDE.md rule #12) was that the footer must derive from
 * STANDARDS_VERSIONS rather than hard-code editions. That still holds; the
 * derivation now includes jurisdiction.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  AS_IICRC_ADOPTIONS,
  STANDARDS_VERSIONS,
  standardEdition,
  reportStandardsFooterLine,
} from "@/lib/nir-standards-mapping";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("report footer standards line tracks the registries", () => {
  it("never ships the stale S520 3rd / S700 2nd edition literals", () => {
    const line = reportStandardsFooterLine("AU", "VIC", "2026-08-31");
    expect(line).not.toMatch(/S520 3rd/);
    expect(line).not.toMatch(/S700 2nd/);
  });

  it("reflects the S500/S520/S700 editions from the registry", () => {
    const line = reportStandardsFooterLine("AU", "VIC", "2026-08-31");
    expect(line).toContain(`S500:${STANDARDS_VERSIONS.S500.year}`);
    expect(line).toContain(
      `S520 ${STANDARDS_VERSIONS.S520.edition} Ed (${STANDARDS_VERSIONS.S520.year})`,
    );
    expect(line).toContain(
      `S700 ${STANDARDS_VERSIONS.S700.edition} Ed (${STANDARDS_VERSIONS.S700.year})`,
    );
  });

  it("names the Australian adoption on an AU report", () => {
    const line = reportStandardsFooterLine("AU", "VIC", "2026-08-31");
    expect(line).toContain(AS_IICRC_ADOPTIONS.S500.designation);
  });
});

describe("the footer NCC citation depends on jurisdiction", () => {
  it("cites NCC 2025 for a Victorian job after 1 May 2026", () => {
    vi.stubEnv("NCC_EDITION", "");
    expect(reportStandardsFooterLine("AU", "VIC", "2026-08-31")).toContain(
      "NCC 2025",
    );
  });

  it("cites NCC 2022 Amendment 2 for a NSW job on the same day", () => {
    vi.stubEnv("NCC_EDITION", "");
    const line = reportStandardsFooterLine("AU", "NSW", "2026-08-31");
    expect(line).toContain("NCC 2022 Amendment 2");
    expect(line).not.toContain("NCC 2025");
  });

  it("omits NCC entirely for a New Zealand job", () => {
    vi.stubEnv("NCC_EDITION", "");
    const line = reportStandardsFooterLine("NZ");
    expect(line).not.toContain("NCC");
    // and does not smuggle the Australian adoption in either
    expect(line).not.toContain("AS-IICRC");
    expect(line).toContain(`S500:${STANDARDS_VERSIONS.S500.year}`);
  });

  it("never prints a bare 'NCC 2022' — superseded nationally since 29/07/2025", () => {
    vi.stubEnv("NCC_EDITION", "");
    for (const state of ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]) {
      const line = reportStandardsFooterLine("AU", state, "2026-08-31");
      expect(line).not.toMatch(/NCC 2022(?! Amendment)/);
    }
  });
});

describe("standardEdition derives edition labels from the registry", () => {
  it("renders ordinal editions as '<edition> Ed'", () => {
    expect(standardEdition("S500")).toBe("5th Ed");
    expect(standardEdition("S520")).toBe("4th Ed");
    expect(standardEdition("S700")).toBe("1st Ed");
  });

  // NCC is deliberately no longer a StandardKey — it is not an ANSI/IICRC
  // standard and its edition varies by jurisdiction. getNccEdition owns it.
});
