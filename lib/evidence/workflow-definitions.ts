/**
 * Sprint G: Job-Type Workflow Definitions
 * Required evidence per claim type for 13 job types
 * IICRC S500:2025 compliant workflow configurations
 *
 * Each job type defines a sequence of workflow steps.
 * Each step specifies required and optional evidence classes,
 * risk tiers, and experience-level adaptations.
 */

import type { EvidenceClass } from "@/lib/types/evidence";

/** Supported job types — maps to InspectionWorkflow.jobType */
export const JOB_TYPES = [
  "WATER_DAMAGE",
  "MOULD",
  "FIRE_SMOKE",
  "SEWAGE",
  "STORM",
  "IMPACT_DAMAGE",
  "VANDALISM",
  "CLANDESTINE_HAZARDOUS",
  "MAKE_SAFE",
  "CONTENTS_ONLY",
  "COMMERCIAL",
  "STRATA",
  "RESIDENTIAL",
] as const;

export type JobType = (typeof JOB_TYPES)[number];

/** Human-readable labels for job types */
export const JOB_TYPE_LABELS: Record<JobType, string> = {
  WATER_DAMAGE: "Water Damage",
  MOULD: "Mould Remediation",
  FIRE_SMOKE: "Fire & Smoke",
  SEWAGE: "Sewage / Category 3",
  STORM: "Storm Damage",
  IMPACT_DAMAGE: "Impact Damage",
  VANDALISM: "Vandalism",
  CLANDESTINE_HAZARDOUS: "Clandestine / Hazardous",
  MAKE_SAFE: "Stabilisation Only",
  CONTENTS_ONLY: "Contents Only",
  COMMERCIAL: "Commercial",
  STRATA: "Strata / Body Corporate",
  RESIDENTIAL: "Residential",
};

/** A single step definition within a workflow template */
export interface WorkflowStepDefinition {
  stepKey: string;
  stepTitle: string;
  stepDescription: string; // Verbose — apprentice mode
  stepDescriptionShort: string; // Condensed — experienced mode
  requiredEvidenceClasses: EvidenceClass[];
  optionalEvidenceClasses: EvidenceClass[];
  minimumEvidenceCount: number;
  isMandatory: boolean;
  riskTier: 1 | 2 | 3;
  escalationNote?: string;
}

/** Full workflow template for a job type */
export interface WorkflowTemplate {
  jobType: JobType;
  label: string;
  description: string;
  steps: WorkflowStepDefinition[];
  /** Risk escalation triggers — conditions that bump step risk tiers */
  riskEscalationTriggers?: string[];
}

// ============================================
// SHARED STEP DEFINITIONS (reused across job types)
// ============================================

const STEP_SITE_ARRIVAL: WorkflowStepDefinition = {
  stepKey: "site_arrival",
  stepTitle: "Site Arrival & Safety Assessment",
  stepDescription:
    "Arrive on site. Photograph the exterior of the property from the street. " +
    "Check for hazards: electrical, structural, slip/trip, contamination. " +
    "Record any PPE requirements. Note access restrictions.",
  stepDescriptionShort: "Exterior photo + hazard check + PPE note.",
  requiredEvidenceClasses: ["PHOTO_DAMAGE"],
  optionalEvidenceClasses: ["TECHNICIAN_NOTE", "VIDEO_WALKTHROUGH"],
  minimumEvidenceCount: 1,
  isMandatory: true,
  riskTier: 1,
};

const STEP_CLIENT_AUTHORITY: WorkflowStepDefinition = {
  stepKey: "client_authority",
  stepTitle: "Client Authority & Communication",
  stepDescription:
    "Obtain signed authority to proceed from the property owner or their representative. " +
    "Explain the inspection process and expected timeline. " +
    "Record client contact details and insurer claim number if available.",
  stepDescriptionShort: "Authority form signed + client details recorded.",
  requiredEvidenceClasses: ["AUTHORITY_FORM"],
  optionalEvidenceClasses: ["TECHNICIAN_NOTE"],
  minimumEvidenceCount: 1,
  isMandatory: true,
  riskTier: 1,
};

const STEP_INITIAL_DAMAGE_DOCUMENTATION: WorkflowStepDefinition = {
  stepKey: "initial_damage_documentation",
  stepTitle: "Initial Damage Documentation",
  stepDescription:
    "Photograph all visible damage areas. Include wide shots showing the full room " +
    "and close-up shots showing specific damage. Document the source/origin point " +
    "of the loss if identifiable. Note any pre-existing damage.",
  stepDescriptionShort: "Wide + close-up damage photos. Source/origin point.",
  requiredEvidenceClasses: ["PHOTO_DAMAGE"],
  optionalEvidenceClasses: ["VIDEO_WALKTHROUGH", "TECHNICIAN_NOTE"],
  minimumEvidenceCount: 3,
  isMandatory: true,
  riskTier: 1,
};

const STEP_ENVIRONMENTAL_READINGS: WorkflowStepDefinition = {
  stepKey: "environmental_readings",
  stepTitle: "Environmental Conditions Recording",
  stepDescription:
    "Record ambient temperature, relative humidity, and dew point for each affected room " +
    "and at least one unaffected reference room. Use a calibrated hygrometer. " +
    "Note air circulation status (HVAC, windows). These readings establish the " +
    "psychrometric baseline per IICRC S500:2025 §7.3.",
  stepDescriptionShort: "Temp/RH/dew point per room + reference room.",
  requiredEvidenceClasses: ["AMBIENT_ENVIRONMENTAL"],
  optionalEvidenceClasses: ["TECHNICIAN_NOTE"],
  minimumEvidenceCount: 2,
  isMandatory: true,
  riskTier: 1,
};

const STEP_MOISTURE_SURVEY: WorkflowStepDefinition = {
  stepKey: "moisture_survey",
  stepTitle: "Initial Moisture Survey",
  stepDescription:
    "Conduct a systematic moisture survey of all affected and adjacent areas. " +
    "Use both pin-type and pinless moisture meters. Record readings on " +
    "walls (at 150mm, 600mm, and 1200mm heights), floors, and ceilings. " +
    "Map the moisture boundary — the line between wet and dry. " +
    "Per IICRC S500:2025 §10.2.",
  stepDescriptionShort: "Pin + pinless readings. Map moisture boundary.",
  requiredEvidenceClasses: ["MOISTURE_READING"],
  optionalEvidenceClasses: ["THERMAL_IMAGE", "FLOOR_PLAN"],
  minimumEvidenceCount: 5,
  isMandatory: true,
  riskTier: 2,
  escalationNote:
    "Elevated: Accurate moisture mapping is critical for drying scope.",
};

const STEP_THERMAL_IMAGING: WorkflowStepDefinition = {
  stepKey: "thermal_imaging",
  stepTitle: "Thermal Imaging Survey",
  stepDescription:
    "Use an infrared camera to identify hidden moisture behind walls, ceilings, " +
    "and under floors. Capture thermal images of each affected area alongside " +
    "a standard photo of the same view for comparison. " +
    "Per IICRC S500:2025 §10.2.4.",
  stepDescriptionShort:
    "IR camera scan of all affected areas + comparison photos.",
  requiredEvidenceClasses: ["THERMAL_IMAGE"],
  optionalEvidenceClasses: ["PHOTO_DAMAGE"],
  minimumEvidenceCount: 2,
  isMandatory: false,
  riskTier: 1,
};

const STEP_FLOOR_PLAN_SKETCH: WorkflowStepDefinition = {
  stepKey: "floor_plan_sketch",
  stepTitle: "Floor Plan & Affected Area Sketch",
  stepDescription:
    "Create or annotate a floor plan showing all affected areas, equipment placement, " +
    "and moisture boundary lines. Mark room dimensions if creating from scratch. " +
    "This becomes the reference document for the drying plan.",
  stepDescriptionShort: "Annotated floor plan with affected areas + equipment.",
  requiredEvidenceClasses: ["FLOOR_PLAN"],
  optionalEvidenceClasses: ["TECHNICIAN_NOTE"],
  minimumEvidenceCount: 1,
  isMandatory: true,
  riskTier: 1,
};

const STEP_EQUIPMENT_DEPLOYMENT: WorkflowStepDefinition = {
  stepKey: "equipment_deployment",
  stepTitle: "Equipment Deployment & Documentation",
  stepDescription:
    "Deploy drying equipment (dehumidifiers, air movers, HEPA units). " +
    "Photograph each piece of equipment in position showing serial number/asset tag. " +
    "Record equipment type, serial number, and placement location. " +
    "Per IICRC S500:2025 §11.1.",
  stepDescriptionShort: "Deploy + photo each unit with serial visible.",
  requiredEvidenceClasses: ["PHOTO_EQUIPMENT", "EQUIPMENT_LOG"],
  optionalEvidenceClasses: ["FLOOR_PLAN"],
  minimumEvidenceCount: 2,
  isMandatory: true,
  riskTier: 1,
};

const STEP_SCOPE_OF_WORKS: WorkflowStepDefinition = {
  stepKey: "scope_of_works",
  stepTitle: "Scope of Works Documentation",
  stepDescription:
    "Document the full scope of restoration works required. Include demolition, " +
    "cleaning, drying, and any specialist works. Reference affected areas and " +
    "evidence collected. This forms the basis of the cost estimate.",
  stepDescriptionShort: "Full scope document referencing evidence collected.",
  requiredEvidenceClasses: ["SCOPE_DOCUMENT"],
  optionalEvidenceClasses: ["TECHNICIAN_NOTE"],
  minimumEvidenceCount: 1,
  isMandatory: true,
  riskTier: 1,
};

const STEP_COMPLETION_VERIFICATION: WorkflowStepDefinition = {
  stepKey: "completion_verification",
  stepTitle: "Completion Verification & Sign-Off",
  stepDescription:
    "Final moisture readings confirming materials have reached target drying goals. " +
    "Photograph restored areas showing completion standard. " +
    "Obtain client sign-off on completed works. " +
    "Per IICRC S500:2025 §12.6.",
  stepDescriptionShort:
    "Final readings at goal + completion photos + client sign-off.",
  requiredEvidenceClasses: [
    "MOISTURE_READING",
    "PHOTO_COMPLETION",
    "AUTHORITY_FORM",
  ],
  optionalEvidenceClasses: ["TECHNICIAN_NOTE"],
  minimumEvidenceCount: 3,
  isMandatory: true,
  riskTier: 2,
  escalationNote:
    "Elevated: Completion verification is insurance audit trigger.",
};

// ============================================
// JOB-TYPE SPECIFIC STEPS
// ============================================

const STEP_CONTAMINATION_ASSESSMENT: WorkflowStepDefinition = {
  stepKey: "contamination_assessment",
  stepTitle: "Contamination Assessment",
  stepDescription:
    "Assess contamination level. For Category 2 (grey water) or Category 3 (black water), " +
    "document the contamination source, affected materials, and required PPE level. " +
    "Take samples for lab analysis if contamination type is uncertain. " +
    "Per IICRC S500:2025 §7.3.",
  stepDescriptionShort: "Contamination source + PPE level + samples if needed.",
  requiredEvidenceClasses: ["PHOTO_DAMAGE", "TECHNICIAN_NOTE"],
  optionalEvidenceClasses: ["LAB_RESULT", "VIDEO_WALKTHROUGH"],
  minimumEvidenceCount: 2,
  isMandatory: true,
  riskTier: 3,
  escalationNote:
    "Critical: Contamination misclassification is a health/liability risk.",
};

const STEP_MOULD_SAMPLING: WorkflowStepDefinition = {
  stepKey: "mould_sampling",
  stepTitle: "Mould Assessment & Sampling",
  stepDescription:
    "Visually assess mould growth. Photograph all visible mould with scale reference. " +
    "Take air and surface samples for lab analysis per IICRC S520. " +
    "Record affected material types and area measurements. " +
    "Note whether growth is active or dormant.",
  stepDescriptionShort: "Mould photos with scale + air/surface samples.",
  requiredEvidenceClasses: ["PHOTO_DAMAGE", "LAB_RESULT"],
  optionalEvidenceClasses: ["TECHNICIAN_NOTE", "VIDEO_WALKTHROUGH"],
  minimumEvidenceCount: 3,
  isMandatory: true,
  riskTier: 3,
  escalationNote:
    "Critical: Mould species identification required for remediation protocol.",
};

const STEP_FIRE_SMOKE_ASSESSMENT: WorkflowStepDefinition = {
  stepKey: "fire_smoke_assessment",
  stepTitle: "Fire & Smoke Damage Assessment",
  stepDescription:
    "Document fire origin point (if determinable). Photograph char patterns, " +
    "smoke damage, soot deposits on all surfaces. Record odour levels. " +
    "Note structural integrity concerns. Document contents damage.",
  stepDescriptionShort: "Origin + char/smoke/soot photos + structural notes.",
  requiredEvidenceClasses: ["PHOTO_DAMAGE", "TECHNICIAN_NOTE"],
  optionalEvidenceClasses: ["VIDEO_WALKTHROUGH", "THERMAL_IMAGE", "LAB_RESULT"],
  minimumEvidenceCount: 4,
  isMandatory: true,
  riskTier: 2,
  escalationNote:
    "Elevated: Structural compromise may require engineer referral.",
};

const STEP_HAZMAT_ASSESSMENT: WorkflowStepDefinition = {
  stepKey: "hazmat_assessment",
  stepTitle: "Hazardous Materials Assessment",
  stepDescription:
    "Identify potential hazardous materials: asbestos (pre-1990 buildings), " +
    "lead paint, chemical contamination, biological hazards. " +
    "Do NOT disturb suspected asbestos — photograph and note location only. " +
    "Arrange licensed assessor if asbestos suspected. Record PPE worn.",
  stepDescriptionShort:
    "Hazmat ID + do not disturb asbestos + arrange assessor.",
  requiredEvidenceClasses: ["PHOTO_DAMAGE", "TECHNICIAN_NOTE"],
  optionalEvidenceClasses: ["LAB_RESULT", "THIRD_PARTY_REPORT"],
  minimumEvidenceCount: 2,
  isMandatory: true,
  riskTier: 3,
  escalationNote:
    "Critical: Asbestos/hazmat mishandling is a regulatory offence.",
};

const STEP_CONTENTS_INVENTORY: WorkflowStepDefinition = {
  stepKey: "contents_inventory",
  stepTitle: "Contents Inventory & Documentation",
  stepDescription:
    "Photograph and inventory all affected contents. Record item description, " +
    "condition (salvageable/non-salvageable), estimated value, and location. " +
    "Group items by room. Note any high-value or sentimental items separately.",
  stepDescriptionShort: "Photo inventory of all affected contents by room.",
  requiredEvidenceClasses: ["PHOTO_DAMAGE", "SCOPE_DOCUMENT"],
  optionalEvidenceClasses: ["VIDEO_WALKTHROUGH", "TECHNICIAN_NOTE"],
  minimumEvidenceCount: 3,
  isMandatory: true,
  riskTier: 1,
};

const STEP_STRUCTURAL_ASSESSMENT: WorkflowStepDefinition = {
  stepKey: "structural_assessment",
  stepTitle: "Structural Assessment",
  stepDescription:
    "Assess structural integrity of affected areas. Check for sagging ceilings, " +
    "warped framing, foundation cracks, water-damaged bearers/joists. " +
    "If structural compromise is suspected, recommend structural engineer. " +
    "Document all observations with photos and measurements.",
  stepDescriptionShort: "Check structure + refer engineer if compromised.",
  requiredEvidenceClasses: ["PHOTO_DAMAGE", "TECHNICIAN_NOTE"],
  optionalEvidenceClasses: ["THIRD_PARTY_REPORT", "VIDEO_WALKTHROUGH"],
  minimumEvidenceCount: 2,
  isMandatory: false,
  riskTier: 2,
  escalationNote: "Elevated: Structural issues require engineer sign-off.",
};

const STEP_MAKE_SAFE_ACTIONS: WorkflowStepDefinition = {
  stepKey: "make_safe_actions",
  stepTitle: "Stabilisation Actions",
  stepDescription:
    "Perform immediate stabilisation (make-safe): isolate electrical if water near wiring, " +
    "board up broken windows/doors, tarp damaged roof areas, " +
    "extract standing water, remove trip hazards. " +
    "Photograph before AND after each stabilisation action.",
  stepDescriptionShort:
    "Isolate hazards + extract water + before/after photos.",
  requiredEvidenceClasses: ["PHOTO_DAMAGE", "PHOTO_PROGRESS"],
  optionalEvidenceClasses: ["TECHNICIAN_NOTE", "VIDEO_WALKTHROUGH"],
  minimumEvidenceCount: 2,
  isMandatory: true,
  riskTier: 2,
  escalationNote:
    "Elevated: Stabilisation documentation protects against liability.",
};

const STEP_PROGRESS_MONITORING: WorkflowStepDefinition = {
  stepKey: "progress_monitoring",
  stepTitle: "Progress Monitoring & Daily Checks",
  stepDescription:
    "Record daily moisture readings at all mapped points. " +
    "Check equipment is running and positioned correctly. " +
    "Photograph any changes in conditions. Record environmental readings. " +
    "Per IICRC S500:2025 §12.4.",
  stepDescriptionShort:
    "Daily moisture + environmental readings + equipment check.",
  requiredEvidenceClasses: ["MOISTURE_READING", "AMBIENT_ENVIRONMENTAL"],
  optionalEvidenceClasses: ["PHOTO_PROGRESS", "EQUIPMENT_LOG"],
  minimumEvidenceCount: 3,
  isMandatory: true,
  riskTier: 1,
};

const STEP_STRATA_COMMON_AREAS: WorkflowStepDefinition = {
  stepKey: "strata_common_areas",
  stepTitle: "Common Area & Adjacent Lot Assessment",
  stepDescription:
    "Inspect common areas (corridors, stairwells, basement) and adjacent lots " +
    "for water migration. Record which lots are affected and contact strata manager. " +
    "Document common property vs lot property boundaries.",
  stepDescriptionShort: "Common areas + adjacent lots + strata boundary docs.",
  requiredEvidenceClasses: ["PHOTO_DAMAGE", "TECHNICIAN_NOTE"],
  optionalEvidenceClasses: ["MOISTURE_READING", "FLOOR_PLAN"],
  minimumEvidenceCount: 2,
  isMandatory: true,
  riskTier: 1,
};

// ============================================
// WORKFLOW TEMPLATES — 13 JOB TYPES
// ============================================

const WORKFLOW_WATER_DAMAGE: WorkflowTemplate = {
  jobType: "WATER_DAMAGE",
  label: "Water Damage",
  description:
    "Standard water damage restoration — Category 1, 2, or 3 water loss.",
  steps: [
    STEP_SITE_ARRIVAL,
    STEP_CLIENT_AUTHORITY,
    STEP_INITIAL_DAMAGE_DOCUMENTATION,
    STEP_ENVIRONMENTAL_READINGS,
    STEP_MOISTURE_SURVEY,
    STEP_THERMAL_IMAGING,
    STEP_CONTAMINATION_ASSESSMENT,
    STEP_FLOOR_PLAN_SKETCH,
    STEP_EQUIPMENT_DEPLOYMENT,
    STEP_SCOPE_OF_WORKS,
    STEP_PROGRESS_MONITORING,
    STEP_COMPLETION_VERIFICATION,
  ],
  riskEscalationTriggers: [
    "Category 3 water detected — upgrade contamination step to risk tier 3",
    "Asbestos-era building (pre-1990) — add hazmat assessment step",
    "Loss > 72 hours old — upgrade mould risk assessment",
  ],
};

const WORKFLOW_MOULD: WorkflowTemplate = {
  jobType: "MOULD",
  label: "Mould Remediation",
  description: "Mould assessment and remediation per IICRC S520.",
  steps: [
    STEP_SITE_ARRIVAL,
    STEP_CLIENT_AUTHORITY,
    STEP_INITIAL_DAMAGE_DOCUMENTATION,
    STEP_ENVIRONMENTAL_READINGS,
    STEP_MOULD_SAMPLING,
    STEP_MOISTURE_SURVEY,
    STEP_HAZMAT_ASSESSMENT,
    STEP_FLOOR_PLAN_SKETCH,
    STEP_EQUIPMENT_DEPLOYMENT,
    STEP_SCOPE_OF_WORKS,
    STEP_PROGRESS_MONITORING,
    STEP_COMPLETION_VERIFICATION,
  ],
  riskEscalationTriggers: [
    "Toxic mould species identified (Stachybotrys) — full containment protocol",
    "Area > 10 sqm — licensed remediation required",
    "Occupant health complaints — medical referral recommended",
  ],
};

const WORKFLOW_FIRE_SMOKE: WorkflowTemplate = {
  jobType: "FIRE_SMOKE",
  label: "Fire & Smoke",
  description: "Fire and smoke damage assessment and restoration.",
  steps: [
    STEP_SITE_ARRIVAL,
    STEP_CLIENT_AUTHORITY,
    STEP_FIRE_SMOKE_ASSESSMENT,
    STEP_STRUCTURAL_ASSESSMENT,
    STEP_HAZMAT_ASSESSMENT,
    STEP_CONTENTS_INVENTORY,
    STEP_ENVIRONMENTAL_READINGS,
    STEP_FLOOR_PLAN_SKETCH,
    STEP_EQUIPMENT_DEPLOYMENT,
    STEP_SCOPE_OF_WORKS,
    STEP_COMPLETION_VERIFICATION,
  ],
  riskEscalationTriggers: [
    "Structural damage detected — engineer referral mandatory",
    "Asbestos-containing materials disturbed by fire — licensed removal",
    "Electrical system compromised — electrician clearance before re-entry",
  ],
};

const WORKFLOW_SEWAGE: WorkflowTemplate = {
  jobType: "SEWAGE",
  label: "Sewage / Category 3",
  description: "Category 3 black water — sewage backup or contaminated flood.",
  steps: [
    STEP_SITE_ARRIVAL,
    STEP_CLIENT_AUTHORITY,
    STEP_CONTAMINATION_ASSESSMENT,
    STEP_INITIAL_DAMAGE_DOCUMENTATION,
    STEP_ENVIRONMENTAL_READINGS,
    STEP_MOISTURE_SURVEY,
    STEP_HAZMAT_ASSESSMENT,
    STEP_FLOOR_PLAN_SKETCH,
    STEP_EQUIPMENT_DEPLOYMENT,
    STEP_SCOPE_OF_WORKS,
    STEP_PROGRESS_MONITORING,
    STEP_COMPLETION_VERIFICATION,
  ],
  riskEscalationTriggers: [
    "All sewage jobs are minimum risk tier 2",
    "Contamination spread to multiple rooms — full PPE mandatory",
    "Porous materials affected — mandatory removal (no drying)",
  ],
};

const WORKFLOW_STORM: WorkflowTemplate = {
  jobType: "STORM",
  label: "Storm Damage",
  description: "Storm, hail, wind, and flood damage assessment.",
  steps: [
    STEP_SITE_ARRIVAL,
    STEP_CLIENT_AUTHORITY,
    STEP_INITIAL_DAMAGE_DOCUMENTATION,
    STEP_STRUCTURAL_ASSESSMENT,
    STEP_MAKE_SAFE_ACTIONS,
    STEP_ENVIRONMENTAL_READINGS,
    STEP_MOISTURE_SURVEY,
    STEP_FLOOR_PLAN_SKETCH,
    STEP_EQUIPMENT_DEPLOYMENT,
    STEP_SCOPE_OF_WORKS,
    STEP_PROGRESS_MONITORING,
    STEP_COMPLETION_VERIFICATION,
  ],
  riskEscalationTriggers: [
    "Roof breach — tarp immediately, check ceiling structural integrity",
    "Flash flood / overland flow — treat as Category 3 contamination",
    "Multiple properties affected — coordinate with strata/council",
  ],
};

const WORKFLOW_IMPACT_DAMAGE: WorkflowTemplate = {
  jobType: "IMPACT_DAMAGE",
  label: "Impact Damage",
  description: "Vehicle impact, falling tree, or structural impact damage.",
  steps: [
    STEP_SITE_ARRIVAL,
    STEP_CLIENT_AUTHORITY,
    STEP_STRUCTURAL_ASSESSMENT,
    STEP_INITIAL_DAMAGE_DOCUMENTATION,
    STEP_MAKE_SAFE_ACTIONS,
    STEP_ENVIRONMENTAL_READINGS,
    STEP_MOISTURE_SURVEY,
    STEP_FLOOR_PLAN_SKETCH,
    STEP_SCOPE_OF_WORKS,
    STEP_COMPLETION_VERIFICATION,
  ],
  riskEscalationTriggers: [
    "Structural compromise — engineer mandatory before entry",
    "Water ingress from impact — add full moisture workflow",
  ],
};

const WORKFLOW_VANDALISM: WorkflowTemplate = {
  jobType: "VANDALISM",
  label: "Vandalism",
  description: "Intentional property damage — vandalism or break-in.",
  steps: [
    STEP_SITE_ARRIVAL,
    STEP_CLIENT_AUTHORITY,
    STEP_INITIAL_DAMAGE_DOCUMENTATION,
    STEP_MAKE_SAFE_ACTIONS,
    STEP_CONTENTS_INVENTORY,
    STEP_FLOOR_PLAN_SKETCH,
    STEP_SCOPE_OF_WORKS,
    STEP_COMPLETION_VERIFICATION,
  ],
  riskEscalationTriggers: [
    "Police investigation active — do not disturb crime scene areas",
    "Water damage from burst pipes — add full moisture workflow",
    "Fire damage from arson — add fire/smoke workflow",
  ],
};

const WORKFLOW_CLANDESTINE: WorkflowTemplate = {
  jobType: "CLANDESTINE_HAZARDOUS",
  label: "Clandestine / Hazardous",
  description: "Former clandestine drug lab or hazardous contamination site.",
  steps: [
    STEP_SITE_ARRIVAL,
    STEP_CLIENT_AUTHORITY,
    STEP_HAZMAT_ASSESSMENT,
    STEP_CONTAMINATION_ASSESSMENT,
    STEP_INITIAL_DAMAGE_DOCUMENTATION,
    STEP_ENVIRONMENTAL_READINGS,
    STEP_FLOOR_PLAN_SKETCH,
    STEP_SCOPE_OF_WORKS,
    STEP_COMPLETION_VERIFICATION,
  ],
  riskEscalationTriggers: [
    "ALL steps minimum risk tier 3 for clandestine jobs",
    "State EPA notification may be required",
    "Licensed hazmat remediation contractor mandatory",
    "Post-remediation clearance testing required by independent assessor",
  ],
};

const WORKFLOW_MAKE_SAFE: WorkflowTemplate = {
  jobType: "MAKE_SAFE",
  label: "Stabilisation Only",
  description: "Emergency stabilisation (make-safe) — no full restoration scope.",
  steps: [
    STEP_SITE_ARRIVAL,
    STEP_CLIENT_AUTHORITY,
    STEP_INITIAL_DAMAGE_DOCUMENTATION,
    STEP_MAKE_SAFE_ACTIONS,
    STEP_SCOPE_OF_WORKS,
  ],
  riskEscalationTriggers: [
    "If water present — add basic moisture readings for documentation",
    "If structural concern — do not enter, call engineer",
  ],
};

const WORKFLOW_CONTENTS_ONLY: WorkflowTemplate = {
  jobType: "CONTENTS_ONLY",
  label: "Contents Only",
  description:
    "Contents pack-out, cleaning, and restoration — no structural works.",
  steps: [
    STEP_SITE_ARRIVAL,
    STEP_CLIENT_AUTHORITY,
    STEP_CONTENTS_INVENTORY,
    STEP_INITIAL_DAMAGE_DOCUMENTATION,
    STEP_SCOPE_OF_WORKS,
    STEP_COMPLETION_VERIFICATION,
  ],
  riskEscalationTriggers: [
    "High-value items (>$5,000 individual) — itemised photo documentation",
    "Contaminated contents (cat 2/3) — decontamination protocol",
  ],
};

const WORKFLOW_COMMERCIAL: WorkflowTemplate = {
  jobType: "COMMERCIAL",
  label: "Commercial",
  description: "Commercial property — office, retail, warehouse, industrial.",
  steps: [
    STEP_SITE_ARRIVAL,
    STEP_CLIENT_AUTHORITY,
    STEP_INITIAL_DAMAGE_DOCUMENTATION,
    STEP_ENVIRONMENTAL_READINGS,
    STEP_MOISTURE_SURVEY,
    STEP_THERMAL_IMAGING,
    STEP_CONTAMINATION_ASSESSMENT,
    STEP_STRUCTURAL_ASSESSMENT,
    STEP_CONTENTS_INVENTORY,
    STEP_FLOOR_PLAN_SKETCH,
    STEP_EQUIPMENT_DEPLOYMENT,
    STEP_SCOPE_OF_WORKS,
    STEP_PROGRESS_MONITORING,
    STEP_COMPLETION_VERIFICATION,
  ],
  riskEscalationTriggers: [
    "Business interruption — expedited drying timeline",
    "Server room / data centre affected — specialist IT recovery",
    "Food preparation area — health authority notification",
    "Asbestos-era commercial building — full hazmat assessment",
  ],
};

const WORKFLOW_STRATA: WorkflowTemplate = {
  jobType: "STRATA",
  label: "Strata / Body Corporate",
  description: "Multi-unit strata property — complex ownership boundaries.",
  steps: [
    STEP_SITE_ARRIVAL,
    STEP_CLIENT_AUTHORITY,
    STEP_INITIAL_DAMAGE_DOCUMENTATION,
    STEP_STRATA_COMMON_AREAS,
    STEP_ENVIRONMENTAL_READINGS,
    STEP_MOISTURE_SURVEY,
    STEP_THERMAL_IMAGING,
    STEP_FLOOR_PLAN_SKETCH,
    STEP_EQUIPMENT_DEPLOYMENT,
    STEP_SCOPE_OF_WORKS,
    STEP_PROGRESS_MONITORING,
    STEP_COMPLETION_VERIFICATION,
  ],
  riskEscalationTriggers: [
    "Multiple lots affected — separate scope per lot",
    "Common property vs lot boundary dispute — document carefully",
    "Strata manager approval required for common area works",
  ],
};

const WORKFLOW_RESIDENTIAL: WorkflowTemplate = {
  jobType: "RESIDENTIAL",
  label: "Residential",
  description: "Standard residential property — house, townhouse, apartment.",
  steps: [
    STEP_SITE_ARRIVAL,
    STEP_CLIENT_AUTHORITY,
    STEP_INITIAL_DAMAGE_DOCUMENTATION,
    STEP_ENVIRONMENTAL_READINGS,
    STEP_MOISTURE_SURVEY,
    STEP_THERMAL_IMAGING,
    STEP_FLOOR_PLAN_SKETCH,
    STEP_EQUIPMENT_DEPLOYMENT,
    STEP_SCOPE_OF_WORKS,
    STEP_PROGRESS_MONITORING,
    STEP_COMPLETION_VERIFICATION,
  ],
  riskEscalationTriggers: [
    "Category 2/3 water — add contamination assessment",
    "Pre-1990 building — add hazmat assessment for asbestos",
    "Loss > 48 hours old — add mould sampling",
  ],
};

// ============================================
// EXPORTED LOOKUP & UTILITY FUNCTIONS
// ============================================

/** All workflow templates indexed by job type */
export const WORKFLOW_TEMPLATES: Record<JobType, WorkflowTemplate> = {
  WATER_DAMAGE: WORKFLOW_WATER_DAMAGE,
  MOULD: WORKFLOW_MOULD,
  FIRE_SMOKE: WORKFLOW_FIRE_SMOKE,
  SEWAGE: WORKFLOW_SEWAGE,
  STORM: WORKFLOW_STORM,
  IMPACT_DAMAGE: WORKFLOW_IMPACT_DAMAGE,
  VANDALISM: WORKFLOW_VANDALISM,
  CLANDESTINE_HAZARDOUS: WORKFLOW_CLANDESTINE,
  MAKE_SAFE: WORKFLOW_MAKE_SAFE,
  CONTENTS_ONLY: WORKFLOW_CONTENTS_ONLY,
  COMMERCIAL: WORKFLOW_COMMERCIAL,
  STRATA: WORKFLOW_STRATA,
  RESIDENTIAL: WORKFLOW_RESIDENTIAL,
};

/** Get the workflow template for a given job type */
export function getWorkflowTemplate(jobType: JobType): WorkflowTemplate {
  const template = WORKFLOW_TEMPLATES[jobType];
  if (!template) {
    throw new Error(`Unknown job type: ${jobType}`);
  }
  return template;
}

/**
 * Build WorkflowStep create-data from a template for Prisma insertion.
 * Returns an array of objects ready for prisma.workflowStep.createMany().
 */
export function buildWorkflowStepsData(
  workflowId: string,
  jobType: JobType,
): Array<{
  workflowId: string;
  stepOrder: number;
  stepKey: string;
  stepTitle: string;
  stepDescription: string | null;
  stepDescriptionShort: string | null;
  requiredEvidenceClasses: string;
  optionalEvidenceClasses: string | null;
  minimumEvidenceCount: number;
  isMandatory: boolean;
  riskTier: number;
  escalationNote: string | null;
  status: "NOT_STARTED";
  updatedAt: Date;
}> {
  const template = getWorkflowTemplate(jobType);
  const now = new Date();

  return template.steps.map((step, index) => ({
    workflowId,
    stepOrder: index,
    stepKey: step.stepKey,
    stepTitle: step.stepTitle,
    stepDescription: step.stepDescription,
    stepDescriptionShort: step.stepDescriptionShort,
    requiredEvidenceClasses: JSON.stringify(step.requiredEvidenceClasses),
    optionalEvidenceClasses:
      step.optionalEvidenceClasses.length > 0
        ? JSON.stringify(step.optionalEvidenceClasses)
        : null,
    minimumEvidenceCount: step.minimumEvidenceCount,
    isMandatory: step.isMandatory,
    riskTier: step.riskTier,
    escalationNote: step.escalationNote ?? null,
    status: "NOT_STARTED" as const,
    updatedAt: now,
  }));
}

/**
 * Calculate the total mandatory evidence count for a job type.
 * Used for submission gate validation.
 */
export function getMandatoryEvidenceCount(jobType: JobType): number {
  const template = getWorkflowTemplate(jobType);
  return template.steps
    .filter((s) => s.isMandatory)
    .reduce((sum, s) => sum + s.minimumEvidenceCount, 0);
}

/**
 * Get all required evidence classes for a job type (deduplicated).
 */
export function getRequiredEvidenceClasses(jobType: JobType): EvidenceClass[] {
  const template = getWorkflowTemplate(jobType);
  const classes = new Set<EvidenceClass>();
  for (const step of template.steps) {
    if (step.isMandatory) {
      for (const cls of step.requiredEvidenceClasses) {
        classes.add(cls);
      }
    }
  }
  return Array.from(classes);
}
