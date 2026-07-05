import { describe, expect, it } from "vitest";
import { checkScopeExpansion } from "../scope-expansion";
import type { WeaknessDetectionInput } from "../types";

describe("checkScopeExpansion", () => {
  it("returns a single P2 unverified/missing finding when no authorised scope baseline is supplied", () => {
    const input: WeaknessDetectionInput = {
      scopeItems: [{ description: "Remove wet carpet" }, { description: "Install dehumidifier" }],
    };

    const findings = checkScopeExpansion(input);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      checkClass: "scope_expansion",
      severity: "P2",
      detectionMethod: "deterministic",
    });
    expect(findings[0].evidenceAnchor).toBe("unverified/missing");
    expect(findings[0].description).toContain("No authorised scope-of-works");
  });

  it("returns the same single P2 finding even with zero recommended scope items", () => {
    const findings = checkScopeExpansion({});

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("P2");
  });

  it("flags a recommended item not present in the authorised baseline as P1 with a real evidence anchor", () => {
    const input: WeaknessDetectionInput = {
      scopeItems: [{ description: "Remove wet carpet" }, { description: "Full kitchen reinstatement" }],
      authorisedScopeItems: [{ description: "Remove wet carpet" }],
    };

    const findings = checkScopeExpansion(input);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkClass: "scope_expansion", severity: "P1" });
    expect(findings[0].evidenceAnchor).toMatchObject({
      reportSectionId: "scopeItems",
      field: "scopeItems[1].description",
      quotedText: "Full kitchen reinstatement",
    });
  });

  it("matches authorised items case-insensitively and ignoring surrounding whitespace, producing no findings", () => {
    const input: WeaknessDetectionInput = {
      scopeItems: [{ description: "  Remove Wet Carpet  " }],
      authorisedScopeItems: [{ description: "remove wet carpet" }],
    };

    const findings = checkScopeExpansion(input);

    expect(findings).toEqual([]);
  });
});
