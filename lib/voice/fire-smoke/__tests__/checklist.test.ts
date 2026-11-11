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

  // Design rule (kind K6): Margot asks, she never rules. A spoken sentence
  // that names a legal duty is always a question, so the technician and their
  // employer decide whether the cited law's conditions are met. A stated
  // condition is not enough: round 6 showed a condition can be present and
  // still be the wrong one.
  it("every spoken legal duty is asked as a question", () => {
    const DUTY = /\b(must|is required|are required|needs? an? (?:Class|licen)|Class [AB]|high-risk construction work)\b/i;
    const spoken = FIRE_CHECKLIST.flatMap((s) => [
      { id: `${s.id}.intro`, text: s.intro },
      ...s.items.map((i) => ({ id: `${s.id}.${i.id}`, text: i.prompt })),
    ]);
    const unconditional = spoken.flatMap(({ id, text }) =>
      text
        .split(/(?<=[.?!])\s+/)
        .filter((sentence) => DUTY.test(sentence))
        .filter((sentence) => !sentence.trim().endsWith("?"))
        .map((sentence) => `${id}: ${sentence}`),
    );
    expect(unconditional).toEqual([]);
  });

  it("asbestos removal follows friability and the SWMS follows listed work (S32, S09 r322)", () => {
    const prompt = (sectionId: string, itemId: string) =>
      FIRE_CHECKLIST.find((s) => s.id === sectionId)!.items.find((i) => i.id === itemId)!.prompt;
    const acm = prompt("asbestos_hazmat", "suspected_acm");
    expect(acm).toMatch(/friable/);
    expect(acm).toMatch(/cannot be judged/);
    expect(acm).toMatch(/Class A/);
    expect(acm).toMatch(/Class B/);
    const swms = prompt("safety_brief", "swms_reviewed");
    expect(swms.startsWith("Will any work today be high-risk construction work")).toBe(true);
    const incident = prompt("safety_brief", "incident_notification");
    expect(incident).toMatch(/whether WorkSafe must be notified/);
    expect(incident).toMatch(/employer/);
    expect(incident).not.toMatch(/\bmay be a notifiable\b/);
    // S42 (WorkSafe Victoria, Report an incident): the scene stays undisturbed
    // until an inspector arrives or WorkSafe advises otherwise, not until the
    // employer decides.
    expect(incident).toMatch(/until a WorkSafe inspector arrives or WorkSafe says otherwise/);
    expect(incident).not.toMatch(/until they decide/);
  });

  it("the research pack carries no real client details", () => {
    expect(PACK).not.toMatch(/RACV/i);
  });
});
