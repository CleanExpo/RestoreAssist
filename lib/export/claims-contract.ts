/**
 * RestoreAssist claims integration contract (v1) — the versioned,
 * machine-readable claims payload for insurer/adjuster handoff.
 *
 * The `report` section binds 1:1 to `NirReportOutput` — the SAME canonical
 * payload the Guidewire handoff route publishes (`buildNirReportOutput`) —
 * so the insurer JSON and the in-app export can never drift. A compile-time
 * assertion below enforces that binding; the colocated test enforces that the
 * checked-in JSON Schema artifact matches this zod source.
 *
 * Insurer-specific fields we cannot populate (claim/policy numbers we don't
 * hold) are EXPLICIT omissions, listed in `explicitOmissions` — never silent
 * gaps.
 *
 * Artifact: docs/contracts/claims-integration-v2.schema.json
 * (docs/contracts/claims-integration-v1.schema.json is frozen - the retired
 * v1 contract, kept so anything bound to v1 still has a stable document.)
 * Regenerate after editing this file:
 *   pnpm exec tsx scripts/generate-claims-schema.ts
 *
 * Versioned via `schemaVersion` (same pattern as lib/export/scope-contract.ts)
 * so any carrier integration binds to a stable contract, not a moving target.
 */
import { z } from "zod/v4";

import type {
  NirEvidenceClearance,
  NirLossClassification,
  NirPhotoManifest,
  NirProperty,
  NirReportOutput,
  NirScopeLineItem,
  NirStandardsCitation,
  NirTechnician,
} from "@/lib/nir-guidewire-integration";

/**
 * 2.0 - `report.photoManifest.photos[].latitude/longitude` widened to
 * `number | null`. Before 2.0 a photo with no GPS fix was published as
 * `0, 0`; a carrier could not tell that from a measurement.
 *
 * This is a MAJOR bump, not a minor, and gets its own artifact. Widening a
 * producer field is not backward compatible: a v1 consumer either rejects
 * every v2 payload at the version gate - including payloads whose
 * coordinates are all present - or lets a null reach numeric handling.
 * Failing loudly on the `z.literal` is a clean break, not compatibility.
 * Publishing the new shape under the v1 artifact name would be worse still,
 * since a carrier re-fetching `claims-integration-v1.schema.json` would get
 * a different contract under an unchanged name. `claims-integration-v1.schema.json`
 * is therefore frozen as the historical record of v1 and is no longer
 * generated; v2 is the live artifact.
 */
export const CLAIMS_INTEGRATION_SCHEMA_VERSION = "2.0";

/**
 * Repo-relative path of the LIVE artifact. The generator and the drift test
 * both import this rather than spelling the path themselves, so the frozen v1
 * document cannot be overwritten by editing one of them: there is only one
 * place to edit, and changing it fails the drift test immediately.
 */
export const CLAIMS_INTEGRATION_ARTIFACT_PATH =
  "docs/contracts/claims-integration-v2.schema.json";

const isoDateTime = z.iso.datetime();

const nirTechnicianSchema = z.strictObject({
  technicianId: z.string(),
  name: z.string(),
  certifications: z.array(z.string()),
  licenceNumber: z.string().optional(),
  licenceState: z.string().optional(),
});

const nirPropertySchema = z.strictObject({
  address: z.string(),
  suburb: z.string(),
  state: z.enum(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "NT", "ACT"]),
  postcode: z.string(),
  locationFlags: z.strictObject({
    isFloodZone: z.boolean(),
    isBushfireProne: z.boolean(),
    isCycloneZone: z.boolean(),
    isHeritageListed: z.boolean(),
    windRegion: z.string().nullable(),
    approximateBALZone: z.string().nullable(),
  }),
});

const nirLossClassificationSchema = z.strictObject({
  lossType: z.string(),
  primaryClassification: z.string(),
  secondaryClassification: z.string().optional(),
  clauseRefs: z.array(z.string()),
  classificationConfidence: z.number().min(0).max(1),
});

const nirScopeLineItemSchema = z.strictObject({
  lineItemId: z.string(),
  category: z.enum(["labour", "materials", "equipment", "contents", "testing"]),
  description: z.string(),
  standardsJustification: z.string(),
  quantity: z.number(),
  unit: z.string(),
  unitRate: z.number().optional(),
  discretionary: z.boolean(),
});

const nirStandardsCitationSchema = z.strictObject({
  standard: z.enum(["IICRC S500", "IICRC S520", "IICRC S700", "NCC 2022"]),
  edition: z.string(),
  clauseRef: z.string(),
  fieldName: z.string(),
  complianceStatus: z.enum(["COMPLIANT", "NON_COMPLIANT", "REQUIRES_ACTION"]),
});

const nirPhotoManifestSchema = z.strictObject({
  totalPhotos: z.number(),
  photos: z.array(
    z.strictObject({
      photoId: z.string(),
      capturedAt: z.string(),
      // Nullable by contract: a photo with no GPS fix reports `null`, never a
      // substituted 0. See NirPhotoManifest for why 0 is not a safe sentinel.
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      sequenceNumber: z.number(),
      category: z.enum([
        "overview",
        "damage",
        "moisture-reading",
        "equipment",
        "content",
        "post-restoration",
      ]),
      standardRef: z.string(),
    }),
  ),
});

const nirEvidenceClearanceSchema = z.strictObject({
  checkedAt: z.string(),
  lossTypeDomain: z.string(),
  gateStatus: z.enum(["open", "partial", "blocked"]),
  certificationMet: z.boolean(),
});

const nirReportOutputSchema = z.strictObject({
  reportId: z.string(),
  inspectionDate: z.string(),
  submittedAt: z.string(),
  technician: nirTechnicianSchema,
  property: nirPropertySchema,
  lossClassification: nirLossClassificationSchema,
  scopeLineItems: z.array(nirScopeLineItemSchema),
  standardsCitations: z.array(nirStandardsCitationSchema),
  photoManifest: nirPhotoManifestSchema,
  evidenceClearance: nirEvidenceClearanceSchema,
});

// Compile-time bind: the contract must stay mutually assignable with the
// canonical insurer payload type AND carry exactly the same keys at every
// level. Mutual assignability alone would NOT catch a new OPTIONAL property
// added to NirReportOutput (structural typing tolerates it, but the strict
// runtime schema would reject real payloads carrying it) — the per-interface
// key-equality asserts below close that hole. If any Nir* interface changes
// shape, one of these lines breaks the build until the contract (and its
// schemaVersion) are consciously updated.
type MutuallyAssignable<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never;
type ExactKeys<A, B> = [keyof A] extends [keyof B]
  ? [keyof B] extends [keyof A]
    ? true
    : never
  : never;
type Bind<A, B> =
  MutuallyAssignable<A, B> extends true ? ExactKeys<A, B> : never;

const _bindReport: Bind<
  z.infer<typeof nirReportOutputSchema>,
  NirReportOutput
> = true;
const _bindTechnician: Bind<
  z.infer<typeof nirTechnicianSchema>,
  NirTechnician
> = true;
const _bindProperty: Bind<
  z.infer<typeof nirPropertySchema>,
  NirProperty
> = true;
const _bindLocationFlags: Bind<
  z.infer<typeof nirPropertySchema>["locationFlags"],
  NirProperty["locationFlags"]
> = true;
const _bindLossClassification: Bind<
  z.infer<typeof nirLossClassificationSchema>,
  NirLossClassification
> = true;
const _bindScopeLineItem: Bind<
  z.infer<typeof nirScopeLineItemSchema>,
  NirScopeLineItem
> = true;
const _bindStandardsCitation: Bind<
  z.infer<typeof nirStandardsCitationSchema>,
  NirStandardsCitation
> = true;
const _bindPhotoManifest: Bind<
  z.infer<typeof nirPhotoManifestSchema>,
  NirPhotoManifest
> = true;
const _bindPhoto: Bind<
  z.infer<typeof nirPhotoManifestSchema>["photos"][number],
  NirPhotoManifest["photos"][number]
> = true;
const _bindEvidenceClearance: Bind<
  z.infer<typeof nirEvidenceClearanceSchema>,
  NirEvidenceClearance
> = true;
void [
  _bindReport,
  _bindTechnician,
  _bindProperty,
  _bindLocationFlags,
  _bindLossClassification,
  _bindScopeLineItem,
  _bindStandardsCitation,
  _bindPhotoManifest,
  _bindPhoto,
  _bindEvidenceClearance,
];

export const claimsIntegrationExportSchema = z.strictObject({
  schemaVersion: z.literal(CLAIMS_INTEGRATION_SCHEMA_VERSION),
  generatedAt: isoDateTime,
  source: z.strictObject({
    system: z.literal("RestoreAssist"),
    inspectionId: z.string(),
  }),
  claimReference: z.strictObject({
    insurerClaimNumber: z.string().nullable(),
    policyNumber: z.string().nullable(),
  }),
  report: nirReportOutputSchema,
  explicitOmissions: z.array(z.string()),
});

export type ClaimsIntegrationExport = z.infer<
  typeof claimsIntegrationExportSchema
>;

export interface ClaimsIntegrationExportInput {
  nir: NirReportOutput;
  inspectionId: string;
  generatedAt?: Date;
  insurerClaimNumber?: string | null;
  policyNumber?: string | null;
}

export function buildClaimsIntegrationExport(
  input: ClaimsIntegrationExportInput,
): ClaimsIntegrationExport {
  const insurerClaimNumber = input.insurerClaimNumber ?? null;
  const policyNumber = input.policyNumber ?? null;

  const explicitOmissions: string[] = [];
  if (insurerClaimNumber === null) {
    explicitOmissions.push("claimReference.insurerClaimNumber");
  }
  if (policyNumber === null) {
    explicitOmissions.push("claimReference.policyNumber");
  }
  // A photo with no GPS fix is a gap, and this contract's whole premise is
  // that gaps are declared rather than filled in. Declared once per AXIS for
  // the whole manifest: once, so a 500-photo job cannot flood the list; per
  // axis, so a half-known fix is not reported as though both were absent.
  const photos = input.nir.photoManifest.photos;
  if (photos.some((photo) => photo.latitude === null)) {
    explicitOmissions.push("report.photoManifest.photos[].latitude");
  }
  if (photos.some((photo) => photo.longitude === null)) {
    explicitOmissions.push("report.photoManifest.photos[].longitude");
  }

  // Parse on build: every emitted envelope is guaranteed schema-valid at the
  // boundary — callers cannot serialize a payload the contract would reject.
  return claimsIntegrationExportSchema.parse({
    schemaVersion: CLAIMS_INTEGRATION_SCHEMA_VERSION,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    source: { system: "RestoreAssist", inspectionId: input.inspectionId },
    claimReference: { insurerClaimNumber, policyNumber },
    report: input.nir,
    explicitOmissions,
  });
}

/** The JSON Schema artifact checked in at docs/contracts/. */
export function claimsIntegrationJsonSchema(): Record<string, unknown> {
  return {
    $id: "https://restoreassist.app/contracts/claims-integration-v2.schema.json",
    title: "RestoreAssist Claims Integration Export v2",
    ...z.toJSONSchema(claimsIntegrationExportSchema),
  };
}
