import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIRE_CHECKLIST, FIRE_SECTION_IDS, isFireSectionId } from "../checklist";
import { FIRE_SOURCES, getFireSource } from "../sources";

const PACK = readFileSync(
  join(process.cwd(), "docs/research/fire-smoke-make-safe-research-pack.md"),
  "utf8",
);

describe("fire checklist", () => {
  it("is non-empty and every section has at least one item", () => {
    expect(FIRE_CHECKLIST.length).toBeGreaterThanOrEqual(10);
    for (const section of FIRE_CHECKLIST) {
      expect(section.items.length, section.id).toBeGreaterThan(0);
      expect(section.keywords.length, section.id).toBeGreaterThan(5);
    }
  });

  it("section and item ids are unique", () => {
    expect(new Set(FIRE_SECTION_IDS).size).toBe(FIRE_SECTION_IDS.length);
    const itemIds = FIRE_CHECKLIST.flatMap((s) => s.items.map((i) => `${s.id}.${i.id}`));
    expect(new Set(itemIds).size).toBe(itemIds.length);
    expect(isFireSectionId("safety_brief")).toBe(true);
    expect(isFireSectionId("made_up")).toBe(false);
  });

  it("every item cites at least one source that resolves to a dated register entry", () => {
    for (const section of FIRE_CHECKLIST) {
      for (const item of section.items) {
        expect(item.cites.length, `${section.id}.${item.id}`).toBeGreaterThan(0);
        for (const cite of item.cites) {
          const source = getFireSource(cite.source);
          expect(source, `${section.id}.${item.id} -> ${cite.source}`).toBeDefined();
          expect(source!.openedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(source!.version.length).toBeGreaterThan(0);
          expect(source!.url).toMatch(/^https:\/\//);
        }
      }
    }
  });

  it("every register entry is a VERIFIED row of the committed research pack", () => {
    for (const source of FIRE_SOURCES) {
      const row = PACK.split("\n").find((line) => line.startsWith(`| ${source.id} |`));
      expect(row, source.id).toBeDefined();
      expect(row, source.id).toContain("VERIFIED");
      expect(row, source.id).not.toContain("UNVERIFIED");
      expect(row, source.id).toContain(source.url);
    }
  });

  it("copyrighted standards are cited by title only, never by clause", () => {
    for (const section of FIRE_CHECKLIST) {
      for (const item of section.items) {
        for (const cite of item.cites) {
          if (getFireSource(cite.source)!.licence === "TITLE_ONLY") {
            expect(cite.pinpoint, `${section.id}.${item.id}`).toBeUndefined();
          }
        }
      }
    }
  });

  it("each section cites at least one source in force in Victoria", () => {
    for (const section of FIRE_CHECKLIST) {
      const inVic = section.items.some((item) =>
        item.cites.some((c) => getFireSource(c.source)!.appliesInVictoria),
      );
      expect(inVic, section.id).toBe(true);
    }
  });

  it("the research pack carries no real client details", () => {
    expect(PACK).not.toMatch(/RACV/i);
  });
});
