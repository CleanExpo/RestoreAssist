/**
 * Tests for lib/nir-standards-mapping.ts — the IICRC clause-reference layer.
 *
 * Punch-list (PR #1029) VERIFIED P1 #8: S540_FIELD_MAP — trauma/biohazard
 * field-map coverage parity with the existing S500/S520/S700 maps.
 *
 * Per CLAUDE.md rule #14, IICRC citations must include edition+section.
 * For S540 we use the current edition: S540:2023.
 */
import { describe, it, expect } from "vitest";
import {
  S500_FIELD_MAP,
  S540_FIELD_MAP,
  getStandardsCitation,
  getFieldMapForClaimType,
  CLAIM_TYPE_PICKER_OPTIONS,
} from "@/lib/nir-standards-mapping";

describe("S500_FIELD_MAP — IICRC S500:2021 edition standardisation (RA-6793)", () => {
  it("every S500 clause reference uses the canonical 'S500:2021 §X' format", () => {
    for (const [key, field] of Object.entries(S500_FIELD_MAP)) {
      expect(
        field.clauseRef,
        `${key}.clauseRef must cite the S500:2021 edition (RA-6793)`,
      ).toMatch(/^S500:2021 §/);
    }
  });

  it("does not leave the legacy '7th Ed'-style 'IICRC S500 §' prefix on any clause", () => {
    for (const field of Object.values(S500_FIELD_MAP)) {
      expect(field.clauseRef.startsWith("IICRC S500 §")).toBe(false);
    }
  });

  it("the moisture-content clause is exactly 'S500:2021 §12.3'", () => {
    expect(S500_FIELD_MAP.moistureContent.clauseRef).toBe("S500:2021 §12.3");
  });
});

describe("S540_FIELD_MAP — IICRC S540:2023 trauma/biohazard field map", () => {
  it("exposes the trauma-scene fields required by §6 Project Scoping", () => {
    expect(S540_FIELD_MAP).toHaveProperty("incidentType");
    expect(S540_FIELD_MAP.incidentType.clauseRef).toMatch(
      /^IICRC S540:2023 §6/,
    );
  });

  it("exposes the worker-protection fields required by §7", () => {
    expect(S540_FIELD_MAP).toHaveProperty("ppeLevel");
    expect(S540_FIELD_MAP.ppeLevel.clauseRef).toMatch(/^IICRC S540:2023 §7/);
  });

  it("exposes the cleaning-procedure fields required by §8", () => {
    expect(S540_FIELD_MAP).toHaveProperty("surfaceCategory");
    expect(S540_FIELD_MAP.surfaceCategory.clauseRef).toMatch(
      /^IICRC S540:2023 §8/,
    );
  });

  it("exposes the verification fields required by §9", () => {
    expect(S540_FIELD_MAP).toHaveProperty("postRemediationVerification");
    expect(S540_FIELD_MAP.postRemediationVerification.clauseRef).toMatch(
      /^IICRC S540:2023 §9/,
    );
  });

  it("exposes the documentation / chain-of-custody fields required by §10", () => {
    expect(S540_FIELD_MAP).toHaveProperty("regulatedWasteDisposalChain");
    expect(S540_FIELD_MAP.regulatedWasteDisposalChain.clauseRef).toMatch(
      /^IICRC S540:2023 §10/,
    );
  });

  it("every field in the map carries an IICRC S540:2023 §X citation per CLAUDE.md rule #14", () => {
    for (const [key, field] of Object.entries(S540_FIELD_MAP)) {
      expect(
        field.clauseRef,
        `${key}.clauseRef must cite edition+section (S540:2023 §X)`,
      ).toMatch(/^IICRC S540:2023 §\d+/);
    }
  });

  it("getStandardsCitation resolves S540 keys to their clauseRef", () => {
    expect(getStandardsCitation("regulatedWasteDisposalChain")).toBe(
      S540_FIELD_MAP.regulatedWasteDisposalChain.clauseRef,
    );
  });
});

describe("getFieldMapForClaimType — routes the form to the correct field map", () => {
  it("BIOHAZARD selects the S540 field map (trauma)", () => {
    const map = getFieldMapForClaimType("BIOHAZARD");
    expect(map).toBe(S540_FIELD_MAP);
  });

  it("WATER, FIRE, MOULD route to their existing field maps", () => {
    expect(getFieldMapForClaimType("WATER")).toBeDefined();
    expect(getFieldMapForClaimType("FIRE")).toBeDefined();
    expect(getFieldMapForClaimType("MOULD")).toBeDefined();
  });

  it("unknown claim type returns null", () => {
    // @ts-expect-error — exercising the null branch for an invalid value
    expect(getFieldMapForClaimType("UFO")).toBeNull();
  });
});

describe("CLAIM_TYPE_PICKER_OPTIONS — the 4 options rendered by the picker", () => {
  it("offers exactly the 4 IICRC-governed claim types", () => {
    const values = CLAIM_TYPE_PICKER_OPTIONS.map((o) => o.value).sort();
    expect(values).toEqual(["BIOHAZARD", "FIRE", "MOULD", "WATER"]);
  });

  it("each option labels its standard with edition+year per CLAUDE.md rule #14", () => {
    const expectedEditions: Record<string, RegExp> = {
      WATER: /S500:2021/,
      MOULD: /S520:2024/,
      BIOHAZARD: /S540:2023/,
      FIRE: /S700:2025/,
    };
    for (const opt of CLAIM_TYPE_PICKER_OPTIONS) {
      expect(opt.label).toMatch(expectedEditions[opt.value]);
    }
  });
});
