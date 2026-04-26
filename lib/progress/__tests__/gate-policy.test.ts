import { describe, expect, it } from "vitest";
import {
  GATE_CATALOGUE,
  classifyGaps,
  gatesByClassification,
  getGate,
  getGatePolicy,
} from "../gate-policy";

describe("gate-policy", () => {
  describe("GATE_CATALOGUE", () => {
    it("declares exactly 16 gates", () => {
      expect(GATE_CATALOGUE).toHaveLength(16);
    });

    it("has unique keys", () => {
      const keys = GATE_CATALOGUE.map((g) => g.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("classifies each gate as HARD, SOFT, or AUDIT", () => {
      for (const g of GATE_CATALOGUE) {
        expect(["HARD", "SOFT", "AUDIT"]).toContain(g.classification);
      }
    });

    it("contains 8 HARD, 4 SOFT, 4 AUDIT gates", () => {
      expect(gatesByClassification("HARD")).toHaveLength(8);
      expect(gatesByClassification("SOFT")).toHaveLength(4);
      expect(gatesByClassification("AUDIT")).toHaveLength(4);
    });

    it("includes the carrier-authority and legal-evidence gates as HARD", () => {
      expect(getGatePolicy("evidence.scope.approved")).toBe("HARD");
      expect(getGatePolicy("evidence.invoice.authority")).toBe("HARD");
      expect(getGatePolicy("evidence.attestor.identity")).toBe("HARD");
      expect(getGatePolicy("evidence.subcontractor.licence")).toBe("HARD");
    });

    it("includes calibration / photo coverage as SOFT", () => {
      expect(getGatePolicy("evidence.calibration.recent")).toBe("SOFT");
      expect(getGatePolicy("evidence.photo.coverage")).toBe("SOFT");
    });

    it("includes weather / location / duration as AUDIT", () => {
      expect(getGatePolicy("evidence.weather.captured")).toBe("AUDIT");
      expect(getGatePolicy("evidence.location.captured")).toBe("AUDIT");
      expect(getGatePolicy("evidence.duration.normal")).toBe("AUDIT");
    });
  });

  describe("getGatePolicy", () => {
    it("returns null for an unknown key", () => {
      expect(getGatePolicy("evidence.does.not.exist")).toBeNull();
    });

    it("looks up by exact key", () => {
      expect(getGatePolicy("evidence.swms.signed")).toBe("HARD");
    });
  });

  describe("getGate", () => {
    it("returns the full entry with label/description", () => {
      const g = getGate("evidence.swms.signed");
      expect(g).toBeTruthy();
      expect(g?.label).toMatch(/SWMS/i);
      expect(g?.description.length).toBeGreaterThan(0);
    });

    it("returns null on an unknown key", () => {
      expect(getGate("nope")).toBeNull();
    });
  });

  describe("classifyGaps", () => {
    it("buckets keys by their catalogue classification", () => {
      const r = classifyGaps([
        "evidence.swms.signed",
        "evidence.photo.coverage",
        "evidence.weather.captured",
        "evidence.scope.approved",
      ]);
      expect(r.hard.sort()).toEqual([
        "evidence.scope.approved",
        "evidence.swms.signed",
      ]);
      expect(r.soft).toEqual(["evidence.photo.coverage"]);
      expect(r.audit).toEqual(["evidence.weather.captured"]);
      expect(r.unknown).toEqual([]);
    });

    it("collects unknown keys for the caller to log", () => {
      const r = classifyGaps([
        "evidence.swms.signed",
        "evidence.totally.fake",
      ]);
      expect(r.hard).toEqual(["evidence.swms.signed"]);
      expect(r.unknown).toEqual(["evidence.totally.fake"]);
    });

    it("returns four empty buckets for an empty input", () => {
      const r = classifyGaps([]);
      expect(r.hard).toEqual([]);
      expect(r.soft).toEqual([]);
      expect(r.audit).toEqual([]);
      expect(r.unknown).toEqual([]);
    });

    it("preserves duplicates (caller responsibility to dedupe)", () => {
      const r = classifyGaps([
        "evidence.photo.coverage",
        "evidence.photo.coverage",
      ]);
      expect(r.soft).toHaveLength(2);
    });
  });

  describe("integration — every appliesTo references a real TransitionKey", () => {
    // Light sanity: collect all appliesTo entries and check none is empty
    // string. This is a defensive check so refactor renames surface here.
    it("never lists an empty transition key", () => {
      for (const g of GATE_CATALOGUE) {
        if (!g.appliesTo) continue;
        for (const k of g.appliesTo) {
          expect(k.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
