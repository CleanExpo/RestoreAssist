/**
 * RA-8497. The office types a date and times; the server reads them in the
 * organisation's timezone, never in the browser's or the server's. Each
 * expected instant is written in UTC by hand.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_ZONE,
  formatVisitWindow,
  resolveTimeZone,
  zonedWallClockToInstant,
} from "../zoned-time";

describe("zonedWallClockToInstant", () => {
  const cases: Array<[string, string, string, string]> = [
    ["Australia/Sydney", "2026-01-15", "09:00", "2026-01-14T22:00:00.000Z"],
    ["Australia/Sydney", "2026-07-15", "09:00", "2026-07-14T23:00:00.000Z"],
    ["Australia/Brisbane", "2026-01-15", "09:00", "2026-01-14T23:00:00.000Z"],
    ["Australia/Adelaide", "2026-01-15", "09:00", "2026-01-14T22:30:00.000Z"],
    ["Australia/Adelaide", "2026-07-15", "09:00", "2026-07-14T23:30:00.000Z"],
    ["Australia/Perth", "2026-07-15", "09:00", "2026-07-15T01:00:00.000Z"],
    ["Australia/Darwin", "2026-01-15", "17:45", "2026-01-15T08:15:00.000Z"],
    ["Pacific/Auckland", "2026-01-15", "09:00", "2026-01-14T20:00:00.000Z"],
    // The day after Sydney's daylight time ends (5 April 2026).
    ["Australia/Sydney", "2026-04-06", "08:00", "2026-04-05T22:00:00.000Z"],
    // The day after it starts (4 October 2026).
    ["Australia/Sydney", "2026-10-05", "08:00", "2026-10-04T21:00:00.000Z"],
  ];
  for (const [zone, date, time, expected] of cases) {
    it(`${date} ${time} in ${zone} is ${expected}`, () => {
      expect(zonedWallClockToInstant(date, time, zone)?.toISOString()).toBe(
        expected,
      );
    });
  }

  it("refuses a malformed or impossible date or time", () => {
    for (const [date, time] of [
      ["2026-02-30", "09:00"],
      ["2026-13-01", "09:00"],
      ["15/01/2026", "09:00"],
      ["2026-01-15", "24:00"],
      ["2026-01-15", "9am"],
      ["", ""],
    ]) {
      expect(zonedWallClockToInstant(date, time, "Australia/Sydney")).toBeNull();
    }
  });
});

describe("resolveTimeZone", () => {
  it("keeps a valid IANA zone", () => {
    expect(resolveTimeZone("Australia/Perth")).toBe("Australia/Perth");
  });

  it("falls back to the default for a missing or invalid zone, without throwing", () => {
    expect(DEFAULT_TIME_ZONE).toBe("Australia/Sydney");
    for (const value of [null, undefined, "", "  ", "Not/AZone", "Sydney"]) {
      expect(resolveTimeZone(value)).toBe(DEFAULT_TIME_ZONE);
    }
  });
});

describe("formatVisitWindow", () => {
  it("states the day and times in the organisation's zone", () => {
    const text = formatVisitWindow(
      new Date("2026-01-14T22:00:00Z"),
      new Date("2026-01-15T00:30:00Z"),
      "Australia/Sydney",
      "AU",
    );
    expect(text).toContain("Thursday 15 January 2026");
    expect(text).toMatch(/9:00\s?am/i);
    expect(text).toMatch(/11:30\s?am/i);
  });

  it("uses Perth's wall-clock for a Perth organisation", () => {
    const text = formatVisitWindow(
      new Date("2026-07-15T01:00:00Z"),
      new Date("2026-07-15T03:00:00Z"),
      "Australia/Perth",
      "AU",
    );
    expect(text).toContain("Wednesday 15 July 2026");
    expect(text).toMatch(/9:00\s?am/i);
    expect(text).toMatch(/11:00\s?am/i);
  });
});
