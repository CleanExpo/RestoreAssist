/**
 * Structural integrity of the seven activity SWMS templates.
 *
 * These are safety documents. A template with an empty control column, or a
 * residual risk higher than the risk it started at, is not a cosmetic defect -
 * it is a document a worker relies on that says nothing, or says the controls
 * made things worse. Every assertion here is table-driven across all seven so a
 * new template cannot be added without meeting the same bar.
 */
import { describe, expect, it } from "vitest";
import {
  SWMS_ACTIVITY_IDS,
  SWMS_ACTIVITY_TEMPLATES,
  getSwmsActivityTemplate,
} from "../activity-templates";
import type { SwmsActivityTemplate } from "../activity-swms-types";

const TEMPLATES = SWMS_ACTIVITY_IDS.map(
  (id) => [id, SWMS_ACTIVITY_TEMPLATES[id]] as const,
);

describe("SWMS activity templates", () => {
  it("registers exactly the seven transcribed source documents", () => {
    // Working at Heights is deliberately absent: the supplied PDF is an
    // image-only scan with no text layer. If it is ever added, this count is
    // the thing that forces a conscious decision rather than a silent eight.
    expect(SWMS_ACTIVITY_IDS).toHaveLength(7);
    expect(SWMS_ACTIVITY_IDS).not.toContain("working-at-heights");
  });

  it("every id resolves through the lookup, and unknown ids return null", () => {
    for (const id of SWMS_ACTIVITY_IDS) {
      expect(getSwmsActivityTemplate(id), id).toBeTruthy();
    }
    // Negative control: prove the lookup can fail. Without this, a lookup that
    // returned a template for anything would satisfy the loop above.
    expect(getSwmsActivityTemplate("working-at-heights")).toBeNull();
    expect(getSwmsActivityTemplate("")).toBeNull();
    expect(getSwmsActivityTemplate("__proto__")).toBeNull();
  });

  it.each(TEMPLATES)("%s: carries a non-empty risk table", (_id, tpl) => {
    expect(tpl.rows.length).toBeGreaterThanOrEqual(8);
  });

  it.each(TEMPLATES)(
    "%s: every row states hazards and at least one control",
    (_id, tpl) => {
      for (const row of tpl.rows) {
        expect(row.activity.trim(), "empty activity").not.toBe("");
        expect(row.hazards.length, `${row.activity}: no hazards`).toBeGreaterThan(0);
        expect(row.controls.length, `${row.activity}: no controls`).toBeGreaterThan(0);
        for (const group of row.controls) {
          expect(
            group.items.length,
            `${row.activity}: empty control group`,
          ).toBeGreaterThan(0);
          for (const item of group.items) {
            expect(item.trim(), `${row.activity}: blank control`).not.toBe("");
          }
        }
        expect(row.responsible.trim(), `${row.activity}: no responsible person`).not.toBe("");
      }
    },
  );

  it.each(TEMPLATES)(
    "%s: controls never raise the risk they were applied to",
    (_id, tpl) => {
      for (const row of tpl.rows) {
        expect(
          row.riskAfter,
          `${row.activity}: residual risk ${row.riskAfter} exceeds initial ${row.riskBefore}`,
        ).toBeLessThanOrEqual(row.riskBefore);
      }
    },
  );

  it.each(TEMPLATES)("%s: risk scores stay inside the 1-5 band", (_id, tpl) => {
    for (const row of tpl.rows) {
      for (const score of [row.riskBefore, row.riskAfter]) {
        expect(score, row.activity).toBeGreaterThanOrEqual(1);
        expect(score, row.activity).toBeLessThanOrEqual(5);
      }
    }
  });

  it.each(TEMPLATES)(
    "%s: opens with pre-start checks and closes by leaving the site",
    (_id, tpl) => {
      // The source documents all run planning -> arrival -> induction -> ...
      // -> leaving. A template that skips induction or ends mid-job is a
      // transcription slip, not a stylistic choice.
      expect(tpl.rows[0].activity).toMatch(/^Planning/);
      expect(tpl.rows[1].activity).toBe("Arrive at site");
      expect(tpl.rows[2].activity).toBe("Induction");
      expect(tpl.rows.at(-1)!.activity).toBe("Leaving the work site");
      expect(tpl.rows.map((r) => r.activity)).toContain("Emergency procedures");
    },
  );

  it.each(TEMPLATES)("%s: carries a source revision code", (_id, tpl) => {
    expect(tpl.sourceRevision).toMatch(/^swm[a-z]+\d{6}sk$/);
    expect(tpl.scope.trim()).not.toBe("");
    expect(tpl.trainingRequired.length).toBeGreaterThan(0);
    expect(tpl.ppe.length).toBeGreaterThan(0);
  });

  it("source revision codes are unique across templates", () => {
    const codes = TEMPLATES.map(([, tpl]) => tpl.sourceRevision);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("no template cites the superseded test-and-tag standards", () => {
    // The source documents cite "AS3750 and AS3017" for test-and-tag; neither
    // governs in-service testing of portable equipment. common-rows.ts
    // corrects this to AS/NZS 3760 and AS/NZS 3012, and this guard stops the
    // original slipping back in when a template is next edited.
    const allText = JSON.stringify(SWMS_ACTIVITY_TEMPLATES);
    expect(allText).not.toMatch(/AS\s?3750/);
    expect(allText).not.toMatch(/AS\s?3017/);

    // Positive control: prove the haystack really contains the power-tool row,
    // so the two assertions above are searching something rather than nothing.
    expect(allText).toContain("AS/NZS 3760");
  });

  it("no template hardcodes a jurisdiction's safety Act", () => {
    // Jurisdictional law is resolved from lib/state-detection.ts at compose
    // time. A template that names an Act inline is the UNI-2619 defect class:
    // a citation that cannot be corrected in one place.
    const allText = JSON.stringify(SWMS_ACTIVITY_TEMPLATES);
    for (const pattern of [
      /Work Health and Safety Act\s+\d{4}/i,
      /Occupational Health and Safety Act\s+\d{4}/i,
      /Health and Safety at Work Act\s+\d{4}/i,
      /Queensland Development Code/i,
    ]) {
      expect(allText, `template text matched ${pattern}`).not.toMatch(pattern);
    }
  });

  it("templates are exhaustive over the SwmsActivityId union", () => {
    // A compile-time exhaustiveness proof would pass even if a key were
    // deleted at runtime, so assert on the object itself.
    const keys = Object.keys(SWMS_ACTIVITY_TEMPLATES).sort();
    expect(keys).toEqual([...SWMS_ACTIVITY_IDS].sort());
    for (const [id, tpl] of TEMPLATES) {
      expect((tpl as SwmsActivityTemplate).id, "registry key must match template id").toBe(id);
    }
  });
});
