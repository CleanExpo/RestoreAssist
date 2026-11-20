import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextStep } from "../actions";
import { FIRE_CHECKLIST, sectionSpeech } from "../checklist";
import type { WalkthroughStatus } from "../schema";

/** Kind K16 (round 18): every sourced item question is spoken, not only shown. */
describe("Margot speaks every item question when a section opens", () => {
  const openOn = (sectionId: string) =>
    ({ signoff: { state: "unsigned" }, openSectionIds: [sectionId] }) as unknown as WalkthroughStatus;

  it.each(FIRE_CHECKLIST.map((s) => [s.id, s] as const))("%s: the next prompt carries every item question", (id, section) => {
    const { nextPrompt, nextSectionId } = nextStep(openOn(id));
    expect(nextSectionId).toBe(id);
    expect(nextPrompt.startsWith(section.intro)).toBe(true);
    for (const item of section.items) expect(nextPrompt, item.id).toContain(item.prompt);
  });

  it("the safety brief asks the injury and WorkSafe question aloud", () => {
    const safety = FIRE_CHECKLIST.find((s) => s.id === "safety_brief")!;
    const incident = safety.items.find((i) => i.id === "incident_notification")!;
    expect(sectionSpeech(safety)).toContain(incident.prompt);
  });

  it("only sectionSpeech reads a section introduction on the spoken path", () => {
    const fireDir = join(__dirname, "..");
    const clientDir = join(__dirname, "..", "..", "..", "..", "app", "dashboard", "inspections", "[id]", "voice", "_fire");
    const files = [
      ...readdirSync(fireDir).filter((f) => f.endsWith(".ts")).map((f) => join(fireDir, f)),
      ...readdirSync(clientDir).filter((f) => /\.tsx?$/.test(f)).map((f) => join(clientDir, f)),
    ];
    expect(files.length).toBeGreaterThan(10);
    const readers = files.filter((f) => /\.intro\b/.test(readFileSync(f, "utf8")));
    expect(readers.map((f) => f.split("/").pop())).toEqual(["checklist.ts"]);
  });
});
