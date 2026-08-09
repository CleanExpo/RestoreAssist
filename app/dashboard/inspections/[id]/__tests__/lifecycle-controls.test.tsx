import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldRenderCloseJobPrompt } from "@/components/inspection/close-job-visibility";

const source = readFileSync(
  join(process.cwd(), "app/dashboard/inspections/[id]/page.tsx"),
  "utf8",
);

describe("inspection lifecycle controls", () => {
  it("keeps sign-off visible from completed work through signed submission", () => {
    expect(source).toMatch(
      /const canSignOff =\s*\["ESTIMATED", "COMPLETED", "SUBMITTED"\]\.includes\(\s*inspection\.status,?\s*\)/,
    );
    expect(source).toMatch(/\{canSignOff && \(\s*<InspectionSignOff/);
  });

  it("only exposes invoice generation after sign-off or while already billing", () => {
    expect(source).toMatch(
      /const canGenerateInvoice =\s*\(inspection\.status === "SUBMITTED" && Boolean\(inspection\.signedAt\)\) \|\|\s*inspection\.status === "IN_BILLING"/,
    );
    expect(source).toMatch(
      /\{canGenerateInvoice && \(\s*<Link[\s\S]*?Generate Invoice/,
    );
  });

  it("exposes report generation for review-ready work without reopening billing", () => {
    expect(source).toMatch(
      /const canGenerateReport =\s*\["ESTIMATED", "SUBMITTED", "COMPLETED"\]\.includes\(\s*inspection\.status,?\s*\)/,
    );
    expect(source).toMatch(
      /\{canGenerateReport && \(\s*<button[\s\S]*?Generate NIR Report/,
    );
  });

  it("hides the active close prompt from non-manager roles", () => {
    expect(
      shouldRenderCloseJobPrompt({
        role: "USER",
        status: "IN_BILLING",
        completedAt: null,
      }),
    ).toBe(false);
    expect(
      shouldRenderCloseJobPrompt({
        role: "TECHNICIAN",
        status: "IN_BILLING",
        completedAt: null,
      }),
    ).toBe(false);
  });

  it.each(["MANAGER", "ADMIN"])(
    "shows the active close prompt to %s",
    (role) => {
      expect(
        shouldRenderCloseJobPrompt({
          role,
          status: "IN_BILLING",
          completedAt: null,
        }),
      ).toBe(true);
    },
  );

  it.each(["USER", "TECHNICIAN", "MANAGER", "ADMIN"])(
    "keeps the completed close summary visible to %s",
    (role) => {
      expect(
        shouldRenderCloseJobPrompt({
          role,
          status: "CLOSED",
          completedAt: "2026-08-09T00:00:00.000Z",
        }),
      ).toBe(true);
    },
  );

  it("uses the role-aware close prompt gate on the inspection page", () => {
    expect(source).toMatch(
      /const showCloseJobPrompt = shouldRenderCloseJobPrompt\(\{[\s\S]*?role: session\?\.user\?\.role,[\s\S]*?completedAt: inspection\.completedAt,[\s\S]*?\}\)/,
    );
    expect(source).toMatch(/\{showCloseJobPrompt && \(\s*<CloseJobPrompt/);
  });
});
