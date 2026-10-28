import "server-only";
import type { OmittedEvidence } from "./evidence-adapter";

/**
 * RA-8104: what the report preview does with every stored field and linked
 * record on `Report` and `Inspection`.
 *
 * - "shown": the evidence adapter maps it (or handles it itself).
 * - "context": not evidence about the damage or the work: identity, contact
 *   details, workflow state, timestamps, AI bookkeeping, storage keys.
 *   Anything that describes the damage, the work, the hazards or the money is
 *   evidence, including AI-written summaries and past versions of the report.
 * - any other value: evidence of that kind that the preview does not show
 *   yet. When it is filled, it is listed as not shown, by name only. Its
 *   contents are never copied.
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
  | "document";

export type FieldUse = "shown" | "context" | EvidenceKind;

/** A linked record: its use, whether it holds one or many, and an optional reason. */
export type LinkUse = readonly [FieldUse, "one" | "many", string?];

export const REPORT_FIELDS: Readonly<Record<string, FieldUse>> = {
  id: "shown",
  title: "context",
  description: "finding",
  status: "shown",
  clientName: "context",
  propertyAddress: "shown",
  hazardType: "finding",
  insuranceType: "context",
  totalCost: "financials",
  isSample: "context",
  aiSynopsis: "finding",
  aiSynopsisAt: "context",
  clientSummaryCache: "finding",
  clientSummaryCachedAt: "context",
  createdAt: "shown",
  updatedAt: "shown",
  userId: "shown",
  clientId: "context",
  assignedManagerId: "context",
  assignedAdminId: "context",
  clientContactDetails: "context",
  propertyPostcode: "context",
  claimReferenceNumber: "context",
  incidentDate: "finding",
  technicianAttendanceDate: "finding",
  technicianName: "context",
  technicianFieldReport: "finding",
  propertyId: "context",
  jobNumber: "shown",
  reportInstructions: "context",
  builderDeveloperCompanyName: "context",
  builderDeveloperContact: "context",
  builderDeveloperAddress: "context",
  builderDeveloperPhone: "context",
  ownerManagementContactName: "context",
  ownerManagementPhone: "context",
  ownerManagementEmail: "context",
  lastInspectionDate: "finding",
  buildingChangedSinceLastInspection: "finding",
  structureChangesSinceLastInspection: "finding",
  previousLeakage: "finding",
  emergencyRepairPerformed: "finding",
  reportDepthLevel: "context",
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
  lastEditedBy: "context",
  lastEditedAt: "context",
  completenessScore: "context",
  aiDraftGeneratedAt: "context",
  aiDraftHumanEditedAt: "context",
  reportOwnershipAcknowledgedAt: "context",
  reportOwnershipAcknowledgedBy: "context",
  geographicIntelligence: "finding",
  validationWarnings: "context",
  validationErrors: "context",
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
  insurerName: "context",
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
  propertyCover: "context",
  contentsCover: "context",
  liabilityCover: "context",
  businessInterruption: "context",
  additionalCover: "context",
  detailedReport: "finding",
  excelReportUrl: "context",
  inspectionPdfUrl: "context",
  includeRegulatoryCitations: "context",
  workspaceId: "context",
  businessProfileId: "context",
};

export const REPORT_LINKS: Readonly<Record<string, LinkUse>> = {
  user: ["shown", "one"],
  client: ["context", "one"],
  assignedManager: ["context", "one"],
  assignedAdmin: ["context", "one"],
  scope: ["scope-item", "one"],
  // The adapter shows the latest estimate and lists how many earlier ones it does not show.
  estimates: ["shown", "many"],
  scheduledEmails: ["context", "many"],
  emailAudits: ["context", "many"],
  formSubmissions: ["document", "many"],
  authorityForms: ["document", "many"],
  inspection: ["shown", "one"],
  approvals: ["context", "many"],
  contractorReviews: ["context", "many"],
  invoices: ["financials", "many"],
  restorationDocuments: ["document", "many"],
  interviewSessions: ["finding", "many"],
  workspace: ["context", "one"],
  claimProgress: ["context", "one"],
  equipmentDeployments: ["finding", "many"],
  mobileInspections: ["finding", "many"],
  shareAccess: ["context", "many"],
};

export const INSPECTION_FIELDS: Readonly<Record<string, FieldUse>> = {
  id: "shown",
  reportId: "context",
  clientId: "context",
  insurerProfileId: "context",
  insurerTemplateId: "context",
  claimNumber: "context",
  propertyCountry: "shown",
  inspectionNumber: "context",
  propertyAddress: "context",
  propertyPostcode: "context",
  inspectionDate: "finding",
  technicianName: "context",
  technicianId: "context",
  status: "context",
  submittedAt: "context",
  processedAt: "context",
  closeSummary: "finding",
  completedAt: "context",
  closePackageStorageKey: "context",
  handoverCompletedAt: "context",
  handoverPackageStorageKey: "context",
  source: "context",
  acceptedAt: "context",
  pulseEnabled: "context",
  claimType: "finding",
  signatureUrl: "context",
  signedAt: "context",
  signedByName: "context",
  lossDescription: "finding",
  generatedNarrative: "finding",
  userId: "context",
  totalUsageCost: "context",
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
  propertyDataSource: "context",
  propertyDataFetchedAt: "context",
  floorPlanImageUrl: "document",
  powerCircuits: "finding",
  powerCircuitRatingA: "finding",
  powerDeratePct: "finding",
  contentsManifestDraft: "finding",
  createdAt: "context",
  updatedAt: "shown",
  workspaceId: "context",
};

export const INSPECTION_LINKS: Readonly<Record<string, LinkUse>> = {
  report: ["context", "one"],
  client: ["context", "one"],
  insurerProfile: ["context", "one"],
  captureTokens: ["context", "many"],
  clientEvidenceSubmissions: ["document", "many"],
  rooms: ["finding", "many"],
  mobileInspections: ["finding", "many"],
  clientInvites: ["context", "many"],
  user: ["context", "one"],
  environmentalData: ["moisture-reading", "many"],
  // The adapter shows valid readings and counts the invalidated ones it leaves out.
  moistureReadings: ["shown", "many"],
  affectedAreas: ["finding", "many"],
  scopeItems: ["shown", "many"],
  classifications: ["finding", "many"],
  costEstimates: ["financials", "many"],
  auditLogs: ["context", "many"],
  // The adapter lists each photo itself.
  photos: ["shown", "many"],
  usageEvents: ["context", "many"],
  clientMutations: ["context", "many"],
  fieldCaptureEvents: ["context", "many"],
  aiRunnerReceipts: ["context", "many"],
  aiJobSuggestions: ["scope-item", "many"],
  assessmentGenerations: ["finding", "many"],
  lidarScans: ["document", "many"],
  roomPlanCaptureReceipts: ["context", "many"],
  voiceNotes: ["document", "many"],
  voiceCopilotSessions: ["context", "many"],
  inboundJobMessages: ["document", "many"],
  propertyLookupCache: ["context", "one"],
  evidenceItems: ["document", "many"],
  inspectionWorkflow: ["context", "one"],
  mediaAssets: ["document", "many"],
  workspace: ["context", "one"],
  claimSketches: ["finding", "many", "only their hazards are shown"],
  sketchUnderlayReferences: ["context", "many"],
  drNrpgJobSync: ["context", "one"],
  dryingGoalRecord: ["finding", "one"],
  clientCommsLogs: ["context", "many"],
  liveTeacherSessions: ["context", "many"],
  makeSafeActions: ["finding", "many"],
  scopeVariations: ["scope-item", "many"],
  whsIncidents: ["hazard", "many"],
  swmsDraft: ["hazard", "one"],
  claimProgress: ["context", "one"],
  authorisations: ["document", "many"],
  jobAppointments: ["context", "many"],
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
  return use !== "shown" && use !== "context";
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
      omitted.push({ kind: use, reason: model + " field " + name + " holds evidence this preview does not show yet" });
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
