import { describe, expect, it } from "vitest";
import { planComparison, type ComparisonFrame } from "../comparison";

const TZ = "Australia/Brisbane";
const frame = (over: Partial<ComparisonFrame> = {}): ComparisonFrame => ({
  photoId: "p1",
  stage: "before",
  url: "/api/photos/p1",
  alt: "Kitchen floor before extraction",
  roomId: "kitchen",
  capturedAt: "2026-03-02T09:14:00+10:00",
  source: "inspection-photo",
  ...over,
});
const after = (over: Partial<ComparisonFrame> = {}) =>
  frame({ photoId: "p2", stage: "after", capturedAt: "2026-03-09T15:00:00+10:00", alt: "Kitchen floor after drying", ...over });

describe("planComparison provenance gate", () => {
  it("offers the slider when both frames have time, source and the same room, in order", () => {
    const plan = planComparison(frame(), after(), TZ);
    expect(plan.mode).toBe("slider");
    expect(plan.problems).toEqual([]);
    expect(plan.labels.before).toMatch(/Before/);
    expect(plan.labels.before).toMatch(/2 Mar 2026/);
    expect(plan.labels.before).toMatch(/inspection photo/i);
    expect(plan.labels.after).toMatch(/9 Mar 2026/);
  });

  it("withholds the slider when a capture time is missing and says which frame", () => {
    const plan = planComparison(frame({ capturedAt: null }), after(), TZ);
    expect(plan.mode).toBe("side-by-side");
    expect(plan.problems).toContain("before-capture-time-missing");
    expect(plan.labels.before).toMatch(/capture time not recorded/i);
  });

  it("refuses a capture time with no offset", () => {
    const plan = planComparison(frame({ capturedAt: "2026-03-02T09:14:00" }), after(), TZ);
    expect(plan.mode).toBe("side-by-side");
    expect(plan.problems).toContain("before-capture-time-missing");
  });

  it("withholds the slider when the source is unknown", () => {
    const plan = planComparison(frame(), after({ source: "unknown" }), TZ);
    expect(plan.mode).toBe("side-by-side");
    expect(plan.problems).toContain("after-source-unknown");
  });

  it("withholds the slider when the rooms differ or are not recorded", () => {
    expect(planComparison(frame(), after({ roomId: "hall" }), TZ).problems).toContain("rooms-differ-or-missing");
    expect(planComparison(frame({ roomId: null }), after({ roomId: null }), TZ).problems).toContain("rooms-differ-or-missing");
  });

  it("withholds the slider when the after frame is not later than the before frame", () => {
    const plan = planComparison(frame({ capturedAt: "2026-03-09T15:00:00+10:00" }), after({ capturedAt: "2026-03-02T09:14:00+10:00" }), TZ);
    expect(plan.mode).toBe("side-by-side");
    expect(plan.problems).toContain("after-not-later-than-before");
  });

  it("is unavailable when a frame has no image at all", () => {
    const plan = planComparison(frame({ url: null }), after(), TZ);
    expect(plan.mode).toBe("unavailable");
    expect(plan.problems).toContain("before-image-missing");
  });

  it("requires alt text so the comparison is not silent to a screen reader", () => {
    const plan = planComparison(frame({ alt: "" }), after(), TZ);
    expect(plan.mode).toBe("side-by-side");
    expect(plan.problems).toContain("before-alt-text-missing");
  });
});

describe("planComparison review findings (RA-8107 discovery sweep)", () => {
  it("treats a whitespace-only room as not recorded", () => {
    const plan = planComparison(frame({ roomId: " " }), after({ roomId: " " }), TZ);
    expect(plan.mode).toBe("side-by-side");
    expect(plan.problems).toContain("rooms-differ-or-missing");
  });

  it("rejects a source outside the recorded values (undefined, empty or unexpected)", () => {
    for (const source of [undefined, "", "scan"] as unknown as ComparisonFrame["source"][]) {
      const plan = planComparison(frame({ source }), after(), TZ);
      expect(plan.mode).toBe("side-by-side");
      expect(plan.problems).toContain("before-source-unknown");
    }
  });

  it("rejects reversed or wrong stage labels", () => {
    const plan = planComparison(frame({ stage: "after" }), after({ stage: "before" }), TZ);
    expect(plan.mode).toBe("side-by-side");
    expect(plan.problems).toContain("stage-labels-wrong");
  });

  it("rejects an impossible capture date", () => {
    const plan = planComparison(frame({ capturedAt: "2026-02-30T09:14:00+10:00" }), after(), TZ);
    expect(plan.problems).toContain("before-capture-time-missing");
  });
});
