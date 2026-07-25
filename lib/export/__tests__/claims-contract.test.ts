import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// The guidewire route module pulls in next-auth/prisma/idempotency at import
// time. Stub them so we can import the pure canonical builder
// (buildNirReportOutput) — the SAME source the insurer handoff publishes —
// without a live session or database.
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { inspection: { findUnique: vi.fn() } } }));
vi.mock("@/lib/idempotency", () => ({ withIdempotency: vi.fn() }));
vi.mock("@/lib/auth/assert-tenancy", () => ({ assertInspectionTenancy: vi.fn() }));

import { buildNirReportOutput } from "../../../app/api/inspections/[id]/guidewire/route";
import {
  CLAIMS_INTEGRATION_SCHEMA_VERSION,
  buildClaimsIntegrationExport,
  claimsIntegrationExportSchema,
  claimsIntegrationJsonSchema,
} from "@/lib/export/claims-contract";

// Minimal inspection shape matching fetchInspectionForGuidewire's projection,
// with enough population to exercise every contract section.
function makeInspection(overrides: Record<string, unknown> = {}) {
  return {
    id: "insp_1",
    status: "COMPLETED",
    propertyPostcode: "2150",
    propertyAddress: "123 Smith St, Parramatta NSW 2150",
    inspectionDate: new Date("2026-01-01T00:00:00.000Z"),
    submittedAt: new Date("2026-01-02T00:00:00.000Z"),
    classifications: [],
    scopeItems: [],
    costEstimates: [],
    affectedAreas: [],
    moistureReadings: [],
    environmentalData: [],
    photos: [
      {
        id: "photo_1",
        timestamp: new Date("2026-01-01T10:30:00.000Z"),
        gpsLatitude: -33.815,
        gpsLongitude: 151.001,
        damageCategory: "CAT_2",
      },
    ],
    ...overrides,
  } as unknown as Parameters<typeof buildNirReportOutput>[0];
}

const GENERATED_AT = new Date("2026-07-25T00:00:00.000Z");

function makeExport(extra: Record<string, unknown> = {}) {
  const nir = buildNirReportOutput(makeInspection(), "Tech Name", "user_1", [
    "WRT",
  ]);
  return buildClaimsIntegrationExport({
    nir,
    inspectionId: "insp_1",
    generatedAt: GENERATED_AT,
    ...extra,
  });
}

describe("claims integration contract v1", () => {
  it("a payload generated from the canonical insurer source validates against the contract", () => {
    const payload = makeExport({
      insurerClaimNumber: "CLM-001",
      policyNumber: "POL-99",
    });

    const parsed = claimsIntegrationExportSchema.parse(payload);

    expect(parsed.schemaVersion).toBe(CLAIMS_INTEGRATION_SCHEMA_VERSION);
    expect(parsed.source.system).toBe("RestoreAssist");
    expect(parsed.source.inspectionId).toBe("insp_1");
    expect(parsed.generatedAt).toBe("2026-07-25T00:00:00.000Z");
    expect(parsed.report.reportId).toBeTruthy();
    expect(parsed.report.photoManifest.totalPhotos).toBe(1);
    expect(parsed.claimReference.insurerClaimNumber).toBe("CLM-001");
    expect(parsed.claimReference.policyNumber).toBe("POL-99");
    expect(parsed.explicitOmissions).toEqual([]);
  });

  it("absent insurer-specific fields are explicit omissions, not silent gaps", () => {
    const payload = makeExport();

    expect(payload.claimReference.insurerClaimNumber).toBeNull();
    expect(payload.claimReference.policyNumber).toBeNull();
    expect(payload.explicitOmissions).toEqual([
      "claimReference.insurerClaimNumber",
      "claimReference.policyNumber",
    ]);
    expect(() => claimsIntegrationExportSchema.parse(payload)).not.toThrow();
  });

  it("the checked-in JSON Schema artifact matches the zod source (no drift)", () => {
    const checkedIn = JSON.parse(
      readFileSync(
        join(process.cwd(), "docs/contracts/claims-integration-v1.schema.json"),
        "utf8",
      ),
    );

    expect(checkedIn).toEqual(claimsIntegrationJsonSchema());
  });

  it("rejects a payload that mutates away from the contract", () => {
    const payload = makeExport() as unknown as Record<string, unknown>;
    payload.schemaVersion = "0.9";

    expect(() => claimsIntegrationExportSchema.parse(payload)).toThrow();
  });
});
