import { describe, it, expect } from "vitest";
import script from "../onboarding-welcome.script.json";

describe("onboarding-welcome transcript", () => {
  it("targets the correct slug and the canonical single voice", () => {
    expect(script.slug).toBe("remotion-onboarding-welcome");
    expect(script.voiceId).toBe("jSuBIjxMKhqIfb0wCK1F");
  });

  it("has non-empty, time-ordered segments that fit the 36s composition", () => {
    expect(script.segments.length).toBeGreaterThan(0);
    let prevEnd = 0;
    for (const seg of script.segments) {
      expect(seg.text.trim().length).toBeGreaterThan(0);
      expect(seg.startSec).toBeGreaterThanOrEqual(prevEnd); // no overlap
      prevEnd = seg.startSec + seg.durationSec;
    }
    expect(prevEnd).toBeLessThanOrEqual(script.totalSec);
    expect(script.totalSec).toBe(36);
  });
});
