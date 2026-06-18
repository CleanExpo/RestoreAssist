import { describe, it, expect } from "vitest";
import { shouldCreateReport } from "../should-create-report";

describe("shouldCreateReport (RA-6799 AC2 — no orphan reports)", () => {
  it("creates a report only for a fresh session with no create in flight", () => {
    expect(
      shouldCreateReport({ existingReportId: null, createInFlight: false }),
    ).toBe(true);
    expect(
      shouldCreateReport({ existingReportId: undefined, createInFlight: false }),
    ).toBe(true);
  });

  it("does NOT create when a report already exists (reuse it)", () => {
    expect(
      shouldCreateReport({ existingReportId: "rep_1", createInFlight: false }),
    ).toBe(false);
  });

  it("does NOT create while a create is already in flight (double-submit guard)", () => {
    expect(
      shouldCreateReport({ existingReportId: null, createInFlight: true }),
    ).toBe(false);
  });

  it("REGRESSION: repeated submit / remount never creates a second report", () => {
    // 1. First submit on a fresh session creates exactly one report.
    expect(
      shouldCreateReport({ existingReportId: null, createInFlight: false }),
    ).toBe(true);
    // 2. While that create is in flight, a concurrent/double submit is blocked.
    expect(
      shouldCreateReport({ existingReportId: null, createInFlight: true }),
    ).toBe(false);
    // 3. After creation, every subsequent submit/remount reuses the same report.
    expect(
      shouldCreateReport({ existingReportId: "rep_1", createInFlight: false }),
    ).toBe(false);
    expect(
      shouldCreateReport({ existingReportId: "rep_1", createInFlight: true }),
    ).toBe(false);
  });
});
