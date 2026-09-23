import { describe, expect, it } from "vitest";
import { evidenceReadiness } from "@/lib/evidence/evidence-readiness";

// RA-7713 part 11: readiness can never exceed required-checklist completion.
describe("evidenceReadiness", () => {
  it("is not started at 0 required even when every section is recorded", () => {
    const r = evidenceReadiness({
      sectionsComplete: 6,
      sectionsTotal: 6,
      required: { present: 0, total: 10 },
    });
    expect(r.notStarted).toBe(true);
    expect(r.percent).toBe(0);
    expect(r.requiredComplete).toBe(false);
  });

  it("takes the lower of section and required completion", () => {
    expect(
      evidenceReadiness({ sectionsComplete: 6, sectionsTotal: 6, required: { present: 5, total: 10 } }).percent,
    ).toBe(50);
    expect(
      evidenceReadiness({ sectionsComplete: 3, sectionsTotal: 6, required: { present: 9, total: 10 } }).percent,
    ).toBe(50);
  });

  it("returns a null percent while the required checklist is unknown", () => {
    const r = evidenceReadiness({ sectionsComplete: 6, sectionsTotal: 6, required: null });
    expect(r.percent).toBeNull();
    expect(r.requiredComplete).toBeNull();
  });

  it("is 100% only when both are complete", () => {
    const r = evidenceReadiness({ sectionsComplete: 6, sectionsTotal: 6, required: { present: 10, total: 10 } });
    expect(r.percent).toBe(100);
    expect(r.requiredComplete).toBe(true);
    expect(r.notStarted).toBe(false);
  });

  it("treats a checklist with no required items as not limiting", () => {
    expect(
      evidenceReadiness({ sectionsComplete: 6, sectionsTotal: 6, required: { present: 0, total: 0 } }).percent,
    ).toBe(100);
  });

  it("keeps the section-only behaviour when no required checklist is wired", () => {
    expect(
      evidenceReadiness({ sectionsComplete: 3, sectionsTotal: 6, required: undefined }).percent,
    ).toBe(50);
  });
});
