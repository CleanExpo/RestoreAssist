import { describe, expect, it } from "vitest";
import { formatConsumerReportAttendanceLine } from "../consumer-report";

describe("consumer-report attendance line", () => {
  it("states not recorded when attendance is null", () => {
    expect(formatConsumerReportAttendanceLine(null)).toBe(
      "Site attendance: Not recorded",
    );
  });

  it("formats recorded attendance in en-AU", () => {
    const line = formatConsumerReportAttendanceLine(
      new Date("2026-10-01T00:00:00.000Z"),
    );
    expect(line).toMatch(/^Site attendance: /);
    expect(line).not.toContain("Not recorded");
  });
});
