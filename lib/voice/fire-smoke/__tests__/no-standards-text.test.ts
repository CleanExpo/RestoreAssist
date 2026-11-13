import { describe, expect, it } from "vitest";
import { FIRE_CHECKLIST } from "../checklist";
import { FIRE_COPY } from "../copy";
import { clarifyingQuestion } from "../router";
import { findStandardsTextViolations } from "../copy-guard";

/** Every string Margot speaks or the walkthrough shows. */
function allSpokenAndShownStrings(): string[] {
  const strings: string[] = [];
  for (const section of FIRE_CHECKLIST) {
    strings.push(section.title, section.intro, clarifyingQuestion(section.id));
    for (const item of section.items) strings.push(item.prompt);
  }
  for (const value of Object.values(FIRE_COPY)) {
    strings.push(typeof value === "function" ? value("Example section") : value);
  }
  return strings;
}

describe("no standards text in spoken or shown copy", () => {
  it("collects a meaningful set of strings", () => {
    expect(allSpokenAndShownStrings().length).toBeGreaterThan(60);
  });

  it("no string names a standard, quotes a long passage, or runs past the word cap", () => {
    expect(findStandardsTextViolations(allSpokenAndShownStrings())).toEqual([]);
  });

  it("citations live only in source fields: no prompt carries a citation", () => {
    for (const section of FIRE_CHECKLIST) {
      for (const item of section.items) {
        expect(item.prompt).not.toMatch(/\b(?:s\d+|r\d+|reg(?:ulation)?s?\.?\s?\d+)\b/i);
      }
    }
  });

  describe("canary: the guard must fire", () => {
    it("flags a synthetic standards reference with a quoted passage", () => {
      const canary =
        'Per IICRC S700, "the restorer must always complete the following detailed procedure before any cleaning begins on site".';
      const rules = findStandardsTextViolations([canary]).map((v) => v.rule);
      expect(rules).toContain("standard_reference");
      expect(rules).toContain("quoted_passage");
    });

    it("flags each standards name on its own", () => {
      for (const name of ["ANSI", "S500", "S 520", "AS/NZS 1715", "AS-IICRC", "Standards Australia"]) {
        expect(findStandardsTextViolations([`See ${name} for this.`]), name).toHaveLength(1);
      }
    });

    it("flags an over-long spoken string", () => {
      const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
      expect(findStandardsTextViolations([long]).map((v) => v.rule)).toEqual(["too_long"]);
    });

    it("does not flag apostrophes as quotations", () => {
      expect(findStandardsTextViolations(["I'm Margot and I didn't catch that, it's fine."])).toEqual([]);
    });
  });
});
