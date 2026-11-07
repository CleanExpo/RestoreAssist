import { describe, expect, it } from "vitest";
import { daysSince, inboxAgeingBand, inboxAgeingLabel } from "../inbox-ageing";

describe("inbox ageing", () => {
  it("bands stale at 7+ days", () => {
    expect(inboxAgeingBand(0)).toBe("fresh");
    expect(inboxAgeingBand(3)).toBe("ageing");
    expect(inboxAgeingBand(7)).toBe("stale");
  });

  it("labels idle time", () => {
    expect(inboxAgeingLabel(0)).toBe("Updated today");
    expect(inboxAgeingLabel(4)).toBe("4 days idle");
  });

  it("computes whole days since timestamp", () => {
    const now = Date.parse("2026-06-10T12:00:00.000Z");
    const iso = "2026-06-08T12:00:00.000Z";
    expect(daysSince(iso, now)).toBe(2);
  });
});
