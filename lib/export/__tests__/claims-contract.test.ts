import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// The guidewire route module pulls in next-auth/prisma/idempotency at import
// time. Stub them so we can import the pure canonical builder
// (buildNirReportOutput) — the SAME source the insurer handoff publishes —
// without a live session or database.
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { inspection: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/idempotency", () => ({ withIdempotency: vi.fn() }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(),
}));

import { buildNirReportOutput } from "../../../app/api/inspections/[id]/guidewire/route";
import {
  CLAIMS_INTEGRATION_ARTIFACT_PATH,
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
    classifications: [
      {
        category: "2",
        class: "2",
        standardReference: "IICRC S500:2021 §10.4",
        confidence: 0.92,
      },
    ],
    scopeItems: [
      {
        id: "scope_1",
        itemType: "EQUIPMENT",
        description: "Dehumidifier hire",
        justification: "IICRC S500:2021 §8.3",
        quantity: 2,
        unit: "unit",
        isRequired: true,
      },
    ],
    costEstimates: [{ description: "Dehumidifier hire", rate: 45 }],
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

describe("claims integration contract v2", () => {
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
    // Populated nested sections survive the strict contract round-trip.
    expect(parsed.report.scopeLineItems).toHaveLength(1);
    expect(parsed.report.scopeLineItems[0].unitRate).toBe(45);
    expect(parsed.report.lossClassification.classificationConfidence).toBe(
      0.92,
    );
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
      readFileSync(join(process.cwd(), CLAIMS_INTEGRATION_ARTIFACT_PATH), "utf8"),
    );

    expect(checkedIn).toEqual(claimsIntegrationJsonSchema());
  });

  it("a photo with no GPS fix serialises as null and is a declared omission", () => {
    const nir = buildNirReportOutput(
      makeInspection({
        photos: [
          {
            id: "photo_1",
            timestamp: new Date("2026-01-01T10:30:00.000Z"),
            gpsLatitude: null,
            gpsLongitude: null,
            damageCategory: "CAT_2",
          },
        ],
      }),
      "Tech Name",
      "user_1",
      ["WRT"],
    );

    const payload = buildClaimsIntegrationExport({
      nir,
      inspectionId: "insp_1",
      generatedAt: GENERATED_AT,
      insurerClaimNumber: "CLM-001",
      policyNumber: "POL-99",
    });

    // The strict contract accepts null - it did not before 2.0, so an
    // un-widened schema would have thrown on build rather than shipped 0,0.
    const parsed = claimsIntegrationExportSchema.parse(payload);
    expect(parsed.report.photoManifest.photos[0].latitude).toBeNull();
    expect(parsed.report.photoManifest.photos[0].longitude).toBeNull();
    // ...and the gap is declared, not left for the carrier to notice.
    expect(parsed.explicitOmissions).toContain(
      "report.photoManifest.photos[].latitude",
    );
    expect(parsed.explicitOmissions).toContain(
      "report.photoManifest.photos[].longitude",
    );
  });

  // Per axis, in BOTH directions. A single omission string covering both axes
  // would tell a carrier that a half-known fix is wholly absent, and a
  // single-direction test would leave the other axis's guard un-killable.
  it.each([
    {
      axis: "longitude",
      gpsLatitude: -33.815,
      gpsLongitude: null,
      declared: "report.photoManifest.photos[].longitude",
      notDeclared: "report.photoManifest.photos[].latitude",
    },
    {
      axis: "latitude",
      gpsLatitude: null,
      gpsLongitude: 151.001,
      declared: "report.photoManifest.photos[].latitude",
      notDeclared: "report.photoManifest.photos[].longitude",
    },
  ])(
    "declares only the missing axis when a fix is half-known ($axis)",
    ({ gpsLatitude, gpsLongitude, declared, notDeclared }) => {
      const nir = buildNirReportOutput(
        makeInspection({
          photos: [
            {
              id: "photo_1",
              timestamp: new Date("2026-01-01T10:30:00.000Z"),
              gpsLatitude,
              gpsLongitude,
              damageCategory: "CAT_2",
            },
          ],
        }),
        "Tech Name",
        "user_1",
        ["WRT"],
      );

      const payload = buildClaimsIntegrationExport({
        nir,
        inspectionId: "insp_1",
        generatedAt: GENERATED_AT,
      });

      expect(payload.explicitOmissions).toContain(declared);
      expect(payload.explicitOmissions).not.toContain(notDeclared);
    },
  );

  it("does not declare a coordinate omission when every photo has a fix", () => {
    // Positive control for the assertion above: the default fixture photo
    // carries real GPS, so the omission must be ABSENT. Without this, a
    // mutant that pushes the omission unconditionally would survive.
    const payload = makeExport();

    expect(payload.report.photoManifest.photos[0].latitude).toBe(-33.815);
    expect(payload.explicitOmissions).not.toContain(
      "report.photoManifest.photos[].latitude",
    );
    expect(payload.explicitOmissions).not.toContain(
      "report.photoManifest.photos[].longitude",
    );
  });

  it("pins the major version so a widened producer field cannot ship as v1", () => {
    // 2.0 widened photo latitude/longitude to `number | null` - not backward
    // compatible for a v1 consumer, so it is a MAJOR with its own artifact.
    expect(CLAIMS_INTEGRATION_SCHEMA_VERSION).toBe("2.0");
    expect(() =>
      claimsIntegrationExportSchema.parse({
        ...makeExport(),
        schemaVersion: "1.0",
      }),
    ).toThrow();
  });

  it("leaves the retired v1 artifact frozen at the v1 contract", () => {
    // The whole point of the major bump: a carrier re-fetching the v1 document
    // must still get v1. If the generator ever writes over it, this fails.
    const raw = readFileSync(
      join(process.cwd(), "docs/contracts/claims-integration-v1.schema.json"),
      "utf8",
    );
    const v1 = JSON.parse(raw);

    // The generator writes to CLAIMS_INTEGRATION_ARTIFACT_PATH and nowhere
    // else, so pinning that away from v1 is what keeps this document frozen.
    expect(CLAIMS_INTEGRATION_ARTIFACT_PATH).not.toContain("-v1.");
    expect(v1.properties.schemaVersion.const).toBe("1.0");
    expect(v1.$id).toContain("claims-integration-v1.schema.json");
    // v1 described BOTH coordinates as plain numbers - that is what it retired
    // for. Checking one axis would miss an accidental edit to the other.
    expect(
      v1.properties.report.properties.photoManifest.properties.photos.items
        .properties.latitude,
    ).toEqual({ type: "number" });
    expect(
      v1.properties.report.properties.photoManifest.properties.photos.items
        .properties.longitude,
    ).toEqual({ type: "number" });
    // Frozen means frozen: field-by-field assertions only cover the fields
    // someone thought to name, so pin the whole document. If v1 must ever
    // change, that is a decision worth making deliberately - update this hash
    // and say why in the PR.
    expect(createHash("sha256").update(raw).digest("hex")).toBe(
      "c46ed9d415dfb378e6dbfde78a656a3ee7ec86280fecbc0ed6529800e3216439",
    );
  });

  it("rejects a payload that mutates away from the contract", () => {
    const payload = makeExport() as unknown as Record<string, unknown>;
    payload.schemaVersion = "0.9";

    expect(() => claimsIntegrationExportSchema.parse(payload)).toThrow();
  });
});
