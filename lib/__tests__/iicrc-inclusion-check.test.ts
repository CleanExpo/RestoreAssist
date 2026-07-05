/**
 * lib/iicrc-inclusion-check.ts (RA-5040 PR1)
 *
 * Per-category present/missing fixtures, the unmapped-category graceful
 * degrade, and two hard-rule regression checks:
 *   - no prompt text uses a banned certification/compliance phrasing
 *   - no groundedSection value is absent from the verified field maps /
 *     s500-sections.ts index (RA-6934 fabricated-citation class)
 */
import { describe, it, expect } from "vitest";
import {
  runInclusionCheck,
  getAllInclusionPrompts,
  deriveIicrcClaimTypeFromHazardType,
  S500_FIELD_MAP,
  S520_FIELD_MAP,
  S540_FIELD_MAP,
  S700_FIELD_MAP,
} from "../iicrc-inclusion-check";
import { getS500Section, S500_SECTIONS } from "../standards/s500-sections";

describe("runInclusionCheck — WATER", () => {
  it("reports both prompts missing when no evidence is captured", () => {
    const result = runInclusionCheck("WATER", {});
    expect(result.claimType).toBe("WATER");
    expect(result.present).toHaveLength(0);
    expect(result.missing.map((p) => p.id).sort()).toEqual([
      "water-antimicrobial-documentation",
      "water-clearance-verification",
    ]);
  });

  it("reports both prompts present when the fields are captured", () => {
    const result = runInclusionCheck("WATER", {
      clearanceMoistureReading: 8,
      antimicrobialDocumentation: "Biocide X applied 2026-07-01, logged.",
    });
    expect(result.missing).toHaveLength(0);
    expect(result.present.map((p) => p.id).sort()).toEqual([
      "water-antimicrobial-documentation",
      "water-clearance-verification",
    ]);
  });

  it("treats a recorded zero moisture reading as present, not missing", () => {
    const result = runInclusionCheck("WATER", { clearanceMoistureReading: 0 });
    expect(
      result.present.some((p) => p.id === "water-clearance-verification"),
    ).toBe(true);
  });
});

describe("runInclusionCheck — MOULD", () => {
  it("reports both prompts missing when no evidence is captured", () => {
    const result = runInclusionCheck("MOULD", {});
    expect(result.missing.map((p) => p.id).sort()).toEqual([
      "mould-containment-verification",
      "mould-post-remediation-verification",
    ]);
    expect(result.present).toHaveLength(0);
  });

  it("reports both prompts present when the fields are captured", () => {
    const result = runInclusionCheck("MOULD", {
      containmentVerified: true,
      postRemediationVerification: "Clearance air sample passed.",
    });
    expect(result.missing).toHaveLength(0);
    expect(result.present).toHaveLength(2);
  });

  it("omits groundedSection — S520:2024 edition-level only", () => {
    for (const prompt of runInclusionCheck("MOULD", {}).missing) {
      expect(prompt.groundedSection).toBeUndefined();
    }
  });
});

describe("runInclusionCheck — FIRE", () => {
  it("reports both prompts missing when no evidence is captured", () => {
    const result = runInclusionCheck("FIRE", {});
    expect(result.missing.map((p) => p.id).sort()).toEqual([
      "fire-cross-standard-both-considered",
      "fire-suppression-water-cross-reference",
    ]);
  });

  it("reports both prompts present when the fields are captured", () => {
    const result = runInclusionCheck("FIRE", {
      suppressionWaterCategory: "2",
      crossStandardBothConsidered: true,
    });
    expect(result.missing).toHaveLength(0);
    expect(result.present).toHaveLength(2);
  });
});

describe("runInclusionCheck — BIOHAZARD", () => {
  it("reports the documentation-boundary prompt missing with no evidence", () => {
    const result = runInclusionCheck("BIOHAZARD", {});
    expect(result.missing.map((p) => p.id)).toEqual([
      "biohazard-documentation-boundary",
    ]);
  });

  it("complete-biohazard regression: reports present, nothing missing, once acknowledged", () => {
    const result = runInclusionCheck("BIOHAZARD", {
      documentationBoundaryAcknowledged: true,
    });
    expect(result.missing).toHaveLength(0);
    expect(result.present.map((p) => p.id)).toEqual([
      "biohazard-documentation-boundary",
    ]);
  });
});

describe("runInclusionCheck — unmapped category graceful degrade", () => {
  it.each(["CONTENTS", "STORM", "CARPET", "HVAC", "ASBESTOS", "clandestine", "not-a-real-category", ""])(
    "never throws and degrades to a single reminder for %s",
    (claimType) => {
      expect(() => runInclusionCheck(claimType, {})).not.toThrow();
      const result = runInclusionCheck(claimType, {});
      expect(result.present).toHaveLength(0);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].id).toBe("unmapped-category-no-checks");
      expect(result.missing[0].standard).toBeNull();
      expect(result.missing[0].prompt).toBe(
        "Missing evidence flag: no structured inclusion checks exist yet for this category.",
      );
    },
  );

  it("is case-insensitive and trims whitespace for known categories", () => {
    const result = runInclusionCheck("  water  ", {});
    expect(result.claimType).toBe("WATER");
    expect(result.missing.length).toBeGreaterThan(0);
  });
});

describe("deriveIicrcClaimTypeFromHazardType", () => {
  it("maps free-text hazardType values to the 4 mapped claim types", () => {
    expect(deriveIicrcClaimTypeFromHazardType("WATER_DAMAGE")).toBe("WATER");
    expect(deriveIicrcClaimTypeFromHazardType("Mould")).toBe("MOULD");
    expect(deriveIicrcClaimTypeFromHazardType("Fire and Smoke")).toBe("FIRE");
    expect(deriveIicrcClaimTypeFromHazardType("Biohazard / Trauma")).toBe(
      "BIOHAZARD",
    );
  });

  it("returns null for unmapped or empty hazardType values", () => {
    expect(deriveIicrcClaimTypeFromHazardType("Contents")).toBeNull();
    expect(deriveIicrcClaimTypeFromHazardType(null)).toBeNull();
    expect(deriveIicrcClaimTypeFromHazardType(undefined)).toBeNull();
    expect(deriveIicrcClaimTypeFromHazardType("")).toBeNull();
  });
});

describe("regression: banned phrasing (never certifies/complies/meets/required by law)", () => {
  const BANNED = /\b(complies|certifies|meets|required by law)\b/i;
  const ALLOWED_PREFIXES = [
    "Review prompt: consider whether",
    "Standard-aligned consideration:",
    "Missing evidence flag:",
  ];

  it("every authored prompt uses an allowed phrasing and no banned term", () => {
    const prompts = getAllInclusionPrompts();
    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) {
      expect(prompt.prompt).not.toMatch(BANNED);
      expect(
        ALLOWED_PREFIXES.some((prefix) => prompt.prompt.startsWith(prefix)),
      ).toBe(true);
    }
  });

  it("the unmapped-category degrade prompt also uses an allowed phrasing", () => {
    const degrade = runInclusionCheck("CONTENTS", {}).missing[0];
    expect(degrade.prompt).not.toMatch(BANNED);
    expect(
      ALLOWED_PREFIXES.some((prefix) => degrade.prompt.startsWith(prefix)),
    ).toBe(true);
  });
});

describe("regression: groundedSection is never absent from the verified mappings (RA-6934)", () => {
  it("every non-empty groundedSection matches a verified clauseRef or s500-sections.ts key", () => {
    const verifiedCitations = new Set<string>([
      ...Object.values(S500_FIELD_MAP).map((f) => f.clauseRef),
      ...Object.values(S520_FIELD_MAP).map((f) => f.clauseRef),
      ...Object.values(S540_FIELD_MAP).map((f) => f.clauseRef),
      ...Object.values(S700_FIELD_MAP).map((f) => f.clauseRef),
      ...Object.keys(S500_SECTIONS).map((key) => getS500Section(key)!.citationKey),
    ]);

    const prompts = getAllInclusionPrompts();
    const grounded = prompts.filter((p) => p.groundedSection !== undefined);
    expect(grounded.length).toBeGreaterThan(0); // at least some prompts are grounded

    for (const prompt of grounded) {
      expect(verifiedCitations.has(prompt.groundedSection as string)).toBe(
        true,
      );
    }
  });
});
