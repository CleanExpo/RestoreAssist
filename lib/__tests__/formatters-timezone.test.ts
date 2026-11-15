import { beforeAll, describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "../formatters";

/**
 * RA-8384 — the shared date owner names its zone, so server output does not
 * depend on the machine clock. Sabotage: remove `timeZone` from formatDate.
 */

const EARLY_MORNING_BRISBANE = new Date("2026-11-02T22:00:00Z");

beforeAll(() => {
  process.env.TZ = "UTC";
  expect(
    EARLY_MORNING_BRISBANE.toLocaleDateString("en-AU", { day: "2-digit" }),
  ).toBe("02");
});

describe("RA-8384 lib/formatters date helpers pin the tenant zone", () => {
  it("formats a UTC-evening moment as the next Australian day", () => {
    expect(formatDate(EARLY_MORNING_BRISBANE)).toBe("03/11/2026");
    expect(formatDate("2026-11-02T22:00:00Z", { month: "short" })).toBe(
      "03 Nov 2026",
    );
    expect(formatDate(EARLY_MORNING_BRISBANE, { month: "long" })).toBe(
      "03 November 2026",
    );
  });

  it("keeps a calendar-picked date on its own day", () => {
    expect(formatDate(new Date("2026-11-03"))).toBe("03/11/2026");
    expect(formatDate(new Date("2026-11-03"), { country: "NZ" })).toBe(
      "03/11/2026",
    );
  });

  it("uses the New Zealand zone for NZ tenants", () => {
    // 11:30 UTC 3 Nov = 00:30 4 Nov in Auckland (NZDT), 22:30 3 Nov in Sydney.
    const lateNight = new Date("2026-11-03T11:30:00Z");
    expect(formatDate(lateNight)).toBe("03/11/2026");
    expect(formatDate(lateNight, { country: "NZ" })).toBe("04/11/2026");
  });

  it("formatDateTime prints Sydney wall-clock time", () => {
    // 22:00 UTC = 09:00 Sydney (AEDT, UTC+11) on 3 Nov.
    expect(formatDateTime(EARLY_MORNING_BRISBANE)).toBe("03/11/2026, 09:00");
  });

  it("returns a dash for empty or invalid input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not a date")).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });
});
