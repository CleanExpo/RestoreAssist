import "server-only";
import type { OmittedEvidence } from "./evidence-adapter";

/**
 * RA-8104: what the report preview does with every stored field and linked
 * record on `Report` and `Inspection`.
 *
 * - "shown": the evidence adapter maps it (or handles it itself).
 * - "system": cannot hold evidence: a key to another row, a bookkeeping
 *   timestamp or a settings switch. Never listed.
 * - anything else: when filled, listed as not shown, by name only, with the
 *   kind of evidence it holds ("other" when it is not one of the kinds the
 *   design shows). Its contents are never copied.
 *
 * The default is to list. Listing a field that turns out not to matter costs
 * one line on the page; leaving out one that does is the defect this file
 * exists to prevent. So "system" stays narrow.
 *
 * The test `evidence-inventory.test.ts` fails when the schema gains a field
 * or link that is not listed here, so evidence cannot vanish unnoticed.
 */
export type EvidenceKind =
  | "moisture-reading"
  | "hazard"
  | "scope-item"
  | "financials"
  | "photo"
  | "finding"
  | "document"
  | "other";

export type FieldUse = "shown" | "system" | EvidenceKind;

/** A linked record: its use, whether it holds one or many, and an optional reason. */
export type LinkUse = readonly [FieldUse, "one" | "many", string?];

export const REPORT_FIELDS: Readonly<Record<string, FieldUse>> = {
  id: "shown",
  title: "other",
  description: "finding",
  status: "shown",
  clientName: "other",
  propertyAddress: "shown",
  hazardType: "finding",
  insuranceType: "other",
  totalCost: "financials",
  isSample: "system",
  aiSynopsis: "finding",
  aiSynopsisAt: "system",
  clientSummaryCache: "finding",
  clientSummaryCachedAt: "system",
  createdAt: "shown",
  updatedAt: "shown",
  userId: "shown",
  clientId: "system",
  assignedManagerId: "system",
  assignedAdminId: "system",
  clientContactDetails: "other",
  propertyPostcode: "other",
  claimReferenceNumber: "other",
  incidentDate: "finding",
  technicianAttendanceDate: "finding",
  technicianName: "other",
  technicianFieldReport: "finding",
  propertyId: "system",
  jobNumber: "shown",
  reportInstructions: "other",
  builderDeveloperCompanyName: "other",
  builderDeveloperContact: "other",
  builderDeveloperAddress: "other",
  builderDeveloperPhone: "other",
  ownerManagementContactName: "other",
  ownerManagementPhone: "other",
  ownerManagementEmail: "other",
  lastInspectionDate: "finding",
  buildingChangedSinceLastInspection: "finding",
  structureChangesSinceLastInspection: "finding",
  previousLeakage: "finding",
  emergencyRepairPerformed: "finding",
  reportDepthLevel: "system",
  reportVersion: "shown",
  technicianReportAnalysis: "finding",
  tier1Responses: "finding",
  tier2Responses: "finding",
  tier3Responses: "finding",
  scopeOfWorksDocument: "scope-item",
  scopeOfWorksData: "scope-item",
  costEstimationDocument: "financials",
  costEstimationData: "financials",
  versionHistory: "document",
  lastEditedBy: "system",
  lastEditedAt: "system",
  completenessScore: "other",
  aiDraftGeneratedAt: "system",
  aiDraftHumanEditedAt: "system",
  reportOwnershipAcknowledgedAt: "other",
  reportOwnershipAcknowledgedBy: "other",
  geographicIntelligence: "finding",
  validationWarnings: "other",
  validationErrors: "other",
  reportNumber: "shown",
  inspectionDate: "finding",
  waterCategory: "finding",
  waterClass: "finding",
  sourceOfWater: "finding",
  affectedArea: "finding",
  safetyHazards: "hazard",
  equipmentUsed: "finding",
  dryingPlan: "finding",
  completionDate: "finding",
  buildingAge: "finding",
  structureType: "finding",
  accessNotes: "finding",
  methamphetamineScreen: "hazard",
  methamphetamineTestCount: "hazard",
  biologicalMouldDetected: "hazard",
  biologicalMouldCategory: "hazard",
  phase1StartDate: "finding",
  phase1EndDate: "finding",
  phase2StartDate: "finding",
  phase2EndDate: "finding",
  phase3StartDate: "finding",
  phase3EndDate: "finding",
  insurerName: "other",
  structuralDamage: "finding",
  contentsDamage: "finding",
  hvacAffected: "finding",
  electricalHazards: "hazard",
  microbialGrowth: "hazard",
  dehumidificationCapacity: "finding",
  airmoversCount: "finding",
  targetHumidity: "finding",
  targetTemperature: "finding",
  estimatedDryingTime: "finding",
  psychrometricReadings: "moisture-reading",
  // Older-format JSON readings: the adapter counts these itself.
  moistureReadings: "shown",
  equipmentPlacement: "finding",
  psychrometricAssessment: "finding",
  scopeAreas: "scope-item",
  equipmentSelection: "finding",
  equipmentCostTotal: "financials",
  estimatedDryingDuration: "finding",
  safetyPlan: "hazard",
  containmentSetup: "finding",
  decontaminationProcedures: "finding",
  postRemediationVerification: "finding",
  propertyCover: "financials",
  contentsCover: "financials",
  liabilityCover: "financials",
  businessInterruption: "financials",
  additionalCover: "financials",
  detailedReport: "finding",
  excelReportUrl: "other",
  inspectionPdfUrl: "other",
  includeRegulatoryCitations: "system",
  workspaceId: "system",
  businessProfileId: "system",
};

export const REPORT_LINKS: Readonly<Record<string, LinkUse>> = {
  user: ["shown", "one"],
  client: ["other", "one"],
  assignedManager: ["other", "one"],
  assignedAdmin: ["other", "one"],
  scope: ["scope-item", "one"],
  // The adapter shows the latest estimate and lists how many earlier ones it does not show.
  estimates: ["shown", "many"],
  scheduledEmails: ["other", "many"],
  emailAudits: ["other", "many"],
  formSubmissions: ["document", "many"],
  authorityForms: ["document", "many"],
  inspection: ["shown", "one"],
  approvals: ["financials", "many"],
  contractorReviews: ["other", "many"],
  invoices: ["financials", "many"],
  restorationDocuments: ["document", "many"],
  interviewSessions: ["finding", "many"],
  workspace: ["system", "one"],
  claimProgress: ["other", "one"],
  equipmentDeployments: ["finding", "many"],
  mobileInspections: ["finding", "many"],
  shareAccess: ["system", "many"],
};

export const INSPECTION_FIELDS: Readonly<Record<string, FieldUse>> = {
  id: "shown",
  reportId: "system",
  clientId: "system",
  insurerProfileId: "system",
  insurerTemplateId: "system",
  claimNumber: "other",
  propertyCountry: "shown",
  inspectionNumber: "other",
  propertyAddress: "other",
  propertyPostcode: "other",
  inspectionDate: "finding",
  technicianName: "other",
  technicianId: "system",
  status: "other",
  submittedAt: "other",
  processedAt: "other",
  closeSummary: "finding",
  completedAt: "other",
  closePackageStorageKey: "other",
  handoverCompletedAt: "other",
  handoverPackageStorageKey: "other",
  source: "other",
  acceptedAt: "other",
  pulseEnabled: "system",
  claimType: "finding",
  signatureUrl: "other",
  signedAt: "other",
  signedByName: "other",
  lossDescription: "finding",
  generatedNarrative: "finding",
  userId: "system",
  totalUsageCost: "financials",
  propertyYearBuilt: "finding",
  propertyWallMaterial: "finding",
  propertyWallConstruction: "finding",
  propertyRoofMaterial: "finding",
  propertyFloorType: "finding",
  propertyFloorArea: "finding",
  propertyBedrooms: "finding",
  propertyBathrooms: "finding",
  propertyLandArea: "finding",
  propertyStories: "finding",
  propertyDataSource: "other",
  propertyDataFetchedAt: "system",
  floorPlanImageUrl: "document",
  powerCircuits: "finding",
  powerCircuitRatingA: "finding",
  powerDeratePct: "finding",
  contentsManifestDraft: "finding",
  createdAt: "system",
  updatedAt: "shown",
  workspaceId: "system",
};

export const INSPECTION_LINKS: Readonly<Record<string, LinkUse>> = {
  report: ["system", "one"],
  client: ["other", "one"],
  insurerProfile: ["other", "one"],
  captureTokens: ["system", "many"],
  clientEvidenceSubmissions: ["document", "many"],
  rooms: ["finding", "many"],
  mobileInspections: ["finding", "many"],
  clientInvites: ["other", "many"],
  user: ["system", "one"],
  environmentalData: ["moisture-reading", "many"],
  // The adapter shows valid readings and counts the invalidated ones it leaves out.
  moistureReadings: ["shown", "many"],
  affectedAreas: ["finding", "many"],
  scopeItems: ["shown", "many"],
  classifications: ["finding", "many"],
  costEstimates: ["financials", "many"],
  auditLogs: ["other", "many"],
  // The adapter lists each photo itself.
  photos: ["shown", "many"],
  usageEvents: ["system", "many"],
  clientMutations: ["other", "many"],
  fieldCaptureEvents: ["other", "many"],
  aiRunnerReceipts: ["other", "many"],
  aiJobSuggestions: ["scope-item", "many"],
  assessmentGenerations: ["finding", "many"],
  lidarScans: ["document", "many"],
  roomPlanCaptureReceipts: ["other", "many"],
  voiceNotes: ["document", "many"],
  voiceCopilotSessions: ["other", "many"],
  inboundJobMessages: ["document", "many"],
  propertyLookupCache: ["other", "one"],
  evidenceItems: ["document", "many"],
  inspectionWorkflow: ["other", "one"],
  mediaAssets: ["document", "many"],
  workspace: ["system", "one"],
  claimSketches: ["finding", "many", "only their hazards are shown"],
  sketchUnderlayReferences: ["other", "many"],
  drNrpgJobSync: ["other", "one"],
  dryingGoalRecord: ["finding", "one"],
  clientCommsLogs: ["other", "many"],
  liveTeacherSessions: ["other", "many"],
  makeSafeActions: ["finding", "many"],
  scopeVariations: ["scope-item", "many"],
  whsIncidents: ["hazard", "many"],
  swmsDraft: ["hazard", "one"],
  claimProgress: ["other", "one"],
  authorisations: ["document", "many"],
  jobAppointments: ["other", "many"],
  waterDamageClassification: ["finding", "one"],
  psychrometricReadings: ["moisture-reading", "many"],
  circuitAssessments: ["finding", "many"],
  fireSmokeDamageAssessment: ["finding", "one"],
  mouldRemediationAssessment: ["finding", "one"],
  contentsPackOutItems: ["finding", "many"],
  stormDamageAssessment: ["finding", "one"],
  biohazardAssessment: ["hazard", "one"],
  carpetRestorationAssessment: ["finding", "one"],
  hvacAssessment: ["finding", "one"],
  australianComplianceRecord: ["finding", "one"],
};

function isEvidence(use: FieldUse): use is EvidenceKind {
  return use !== "shown" && use !== "system";
}

// A Boolean false is not counted: those columns default to false, so false
// cannot be told apart from "never recorded".
function isFilled(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/** A Prisma `select` that reads only the evidence the preview does not show. */
export function inventorySelect(
  fields: Readonly<Record<string, FieldUse>>,
  links: Readonly<Record<string, LinkUse>>,
): Record<string, unknown> {
  const select: Record<string, unknown> = {};
  const counts: Record<string, true> = {};
  for (const [name, use] of Object.entries(fields)) {
    if (isEvidence(use)) select[name] = true;
  }
  for (const [name, [use, size]] of Object.entries(links)) {
    if (!isEvidence(use)) continue;
    if (size === "many") counts[name] = true;
    else select[name] = { select: { id: true } };
  }
  if (Object.keys(counts).length > 0) select._count = { select: counts };
  return select;
}

/** Lists each filled evidence field or link of one row as not shown, by name only. */
export function inventoryOmissions(
  model: string,
  row: Record<string, unknown>,
  fields: Readonly<Record<string, FieldUse>>,
  links: Readonly<Record<string, LinkUse>>,
): OmittedEvidence[] {
  const omitted: OmittedEvidence[] = [];
  for (const [name, use] of Object.entries(fields)) {
    if (isEvidence(use) && isFilled(row[name])) {
      omitted.push({ kind: use, reason: model + " field " + name + " is stored but not shown in this preview" });
    }
  }
  const counts = (row._count ?? {}) as Record<string, unknown>;
  for (const [name, [use, size, note]] of Object.entries(links)) {
    if (!isEvidence(use)) continue;
    const label = model + "." + name;
    if (size === "many") {
      const n = counts[name];
      if (typeof n === "number" && n > 0) {
        omitted.push({ kind: use, reason: n + " linked " + label + " record(s): " + (note ?? "not shown in this preview yet") });
      }
    } else {
      const linked = row[name] as { id?: unknown } | null | undefined;
      if (linked && typeof linked.id === "string") {
        omitted.push({ kind: use, id: linked.id, reason: "The linked " + label + " record: " + (note ?? "not shown in this preview yet") });
      }
    }
  }
  return omitted;
}
