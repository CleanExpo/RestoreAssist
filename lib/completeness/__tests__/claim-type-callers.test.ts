/**
 * RA-8337 — the callers of the completeness pack (inbox, Margot prompt)
 * grade each job against its own claim type, not the water pack.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/margot/claim-context", () => ({
  loadClaimContext: vi.fn(async () => ({
    baselineCaptured: false,
    monitoringPointCount: 0,
  })),
}));

import { listCompletenessInboxForOwner } from "../org-inbox";
import { formatClaimContextForPrompt } from "@/lib/margot/claim-context-prompt";

describe("completeness inbox uses the claim type's pack (RA-8337)", () => {
  const row = (id: string, claimType: string) => ({
    id,
    inspectionNumber: id,
    propertyAddress: "1 Test St",
    status: "DRAFT",
    clientId: "client-1",
    claimType,
    createdAt: new Date(2026, 8, 1),
    updatedAt: new Date(2026, 9, 1),
    report: { incidentDate: new Date(2026, 8, 1) },
  });
  const prisma = {
    inspection: {
      findMany: async () => [
        row("water-job", "WATER"),
        row("fire-job", "FIRE"),
        row("mould-job", "MOULD"),
      ],
    },
    waterDamageClassification: { findUnique: async () => null },
    inspectionPhoto: { count: async () => 0 },
  };

  it("lists the water job on s500/baseline but not the fire or mould job", async () => {
    const rows = await listCompletenessInboxForOwner(prisma as never, {
      userId: "u1",
    });
    expect(rows.map((r) => r.inspectionId)).toEqual(["water-job"]);
    expect(rows[0].blocking).toEqual(["s500", "baseline"]);
  });
});

describe("Margot claim prompt follows the claim type's pack (RA-8337)", () => {
  const context = {
    inspectionId: "i1",
    stage: "DRAFT",
    claimType: "FIRE",
    missingFields: ["claimNumber", "waterCategoryClass", "baselineReading"],
    wetReadingCount: 0,
    baselineCaptured: false,
    monitoringPointCount: 0,
    completenessHint: null,
  };

  it("does not feed a fire job the water items", () => {
    const completeness = {
      packId: "baseline" as const,
      facts: [],
      blocking: [],
      completionPercent: 67,
    };
    const text = formatClaimContextForPrompt({ context, completeness });
    expect(text).toContain("No blocking completeness gaps");
    expect(text).toContain("Missing fields: claimNumber");
    expect(text).not.toMatch(/waterCategoryClass|baselineReading|Baseline captured|Wet monitoring/);
  });

  it("keeps the water items for a water job", () => {
    const completeness = {
      packId: "water" as const,
      facts: [],
      blocking: ["client", "s500"],
      completionPercent: 0,
    };
    const text = formatClaimContextForPrompt({
      context: { ...context, claimType: "WATER" },
      completeness,
    });
    expect(text).toContain("waterCategoryClass");
    expect(text).toContain("Baseline captured: no");
  });
});
