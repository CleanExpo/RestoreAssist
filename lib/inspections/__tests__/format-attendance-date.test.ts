import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_NOT_RECORDED_LABEL,
  formatAttendanceDateEnAu,
  formatAttendanceDateEnAuLong,
} from "../format-attendance-date";

describe("format-attendance-date", () => {
  it("returns null when attendance was never recorded", () => {
    expect(formatAttendanceDateEnAu(null)).toBeNull();
    expect(formatAttendanceDateEnAu(undefined)).toBeNull();
    expect(formatAttendanceDateEnAu("")).toBeNull();
  });

  it("formats a recorded attendance date in en-AU", () => {
    expect(formatAttendanceDateEnAu("2026-10-01T00:00:00.000Z")).toMatch(
      /Oct/i,
    );
    expect(formatAttendanceDateEnAuLong("2026-10-01T00:00:00.000Z")).toMatch(
      /October/i,
    );
  });

  it("exports a stable empty-state label", () => {
    expect(ATTENDANCE_NOT_RECORDED_LABEL).toBe("Attendance not recorded");
  });
});
