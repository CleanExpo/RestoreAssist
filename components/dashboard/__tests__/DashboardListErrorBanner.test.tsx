import { describe, expect, it } from "vitest";
import { dashboardListErrorSummary } from "../DashboardListErrorBanner";
import type { ParsedApiError } from "@/lib/client/parse-api-error";

describe("dashboardListErrorSummary", () => {
  it("includes event id and 401 hint context", () => {
    const error: ParsedApiError = {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
      eventId: "abc123",
    };
    const summary = dashboardListErrorSummary(error, "inspections");
    expect(summary).toContain("inspections");
    expect(summary).toContain("abc123");
    expect(summary).toContain("Unauthorized");
  });
});
