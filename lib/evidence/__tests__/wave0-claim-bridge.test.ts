import { describe, it, expect } from "vitest";
import { normalizeClaimType } from "../claim-type";
import { getWorkflowTemplate, JOB_TYPES } from "../workflow-definitions";
import { composePathway } from "@/lib/claim-intelligence/compose-pathway";

/** Mirrors prisma/schema.prisma ClaimType enum (Wave 0 contract). */
const PRISMA_CLAIM_TYPES = [
  "WATER",
  "FIRE",
  "MOULD",
  "STORM",
  "CONTENTS",
  "BIOHAZARD",
  "ODOUR",
  "CARPET",
  "HVAC",
  "ASBESTOS",
] as const;

describe("Wave 0 claim-type bridge", () => {
  it("maps every Prisma claim type to a workflow template", () => {
    for (const ct of PRISMA_CLAIM_TYPES) {
      const jobType = normalizeClaimType(ct);
      expect(jobType, ct).not.toBeNull();
      expect(JOB_TYPES).toContain(jobType);
      expect(getWorkflowTemplate(jobType!).jobType).toBe(jobType);
    }
  });

  it("composePathway accepts every Prisma claim type without throwing", () => {
    for (const ct of PRISMA_CLAIM_TYPES) {
      expect(() =>
        composePathway({ claimType: ct, property: { country: "AU" } }),
      ).not.toThrow();
    }
  });
});