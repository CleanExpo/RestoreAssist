/**
 * Sprint G: Experience-Level Adaptive Guidance
 * [RA-400] Apprentice vs Experienced mode guidance definitions
 *
 * Apprentice: verbose sub-steps, confirming questions, tips, common mistakes
 * Experienced: consolidated view, exception-only prompts, minimal text
 * Same evidence standard — different guidance depth.
 */

// ============================================
// TYPES
// ============================================

export interface SubStep {
  id: string;
  label: string;
  /** Apprentice-only: detailed instruction */
  detail?: string;
}

export interface ConfirmingQuestion {
  id: string;
  question: string;
  /** If true, must be confirmed before step can be marked complete in apprentice mode */
  required: boolean;
}

export interface StepGuidance {
  /** Sub-steps shown as a checklist in apprentice mode */
  subSteps: SubStep[];
  /** Questions shown before step completion in apprentice mode */
  confirmingQuestions: ConfirmingQuestion[];
  /** Tips shown as callouts in apprentice mode */
  tips: string[];
  /** Common mistakes shown as warnings in apprentice mode */
  commonMistakes: string[];
  /** Exception-only notes for experienced mode (only shown when risk tier >= 2) */
  experiencedAlerts: string[];
}

/** Guidance definitions keyed by workflow step key */
export const STEP_GUIDANCE: Record<string, StepGuidance> = {
  site_arrival: {
    subSteps: [
      {
        id: "sa_1",
        label: "Park safely and note access route",
        detail:
          "Record street address, nearest cross-street, and any access codes or gate requirements.",
      },
      {
        id: "sa_2",
        label: "Photograph property exterior from street",
        detail:
          "Take at least 2 photos: one wide shot showing full frontage, one showing the street number visible.",
      },
      {
        id: "sa_3",
        label: "Perform hazard assessment",
        detail:
          "Check for electrical hazards (exposed wiring, standing water near outlets), structural damage (sagging ceilings, cracked walls), slip/trip risks, and contamination signs.",
      },
      {
        id: "sa_4",
        label: "Identify PPE requirements",
        detail:
          "Minimum: steel-cap boots, safety glasses. Cat 2+: add P2 respirator. Cat 3/sewage: full Tyvek suit, gloves, boot covers.",
      },
      {
        id: "sa_5",
        label: "Note any access restrictions",
        detail:
          "Locked rooms, tenant-occupied areas, strata common property boundaries, or areas requiring additional authority.",
      },
    ],
    confirmingQuestions: [
      {
        id: "sa_q1",
        question:
          "Have you photographed the property exterior with the street number visible?",
        required: true,
      },
      {
        id: "sa_q2",
        question:
          "Have you completed a hazard assessment and noted all PPE requirements?",
        required: true,
      },
      {
        id: "sa_q3",
        question:
          "Are there any immediate safety concerns that require escalation before proceeding?",
        required: false,
      },
    ],
    tips: [
      "Always photograph the street number — insurers reject claims without verifiable address evidence.",
      "If you see structural damage (sagging ceiling, cracked load-bearing walls), stop and call your supervisor before entering.",
    ],
    commonMistakes: [
      "Forgetting to photograph the property exterior before entering — you cannot recreate this later.",
      "Not noting PPE requirements upfront — leads to contamination exposure on Cat 3 jobs.",
    ],
    experiencedAlerts: [
      "Cat 3 / clandestine: full PPE before entry. No exceptions.",
    ],
  },

  client_authority: {
    subSteps: [
      {
        id: "ca_1",
        label: "Introduce yourself and present company ID",
        detail:
          "State your name, company, and that you are here for a water damage / restoration inspection.",
      },
      {
        id: "ca_2",
        label: "Explain the inspection process",
        detail:
          "Tell the client what you will do, how long it will take, and what areas you need access to.",
      },
      {
        id: "ca_3",
        label: "Obtain signed authority to proceed",
        detail:
          "Use the authority form — digital signature preferred. Must include property owner name, date, and scope of authority.",
      },
      {
        id: "ca_4",
        label: "Record client and insurer details",
        detail:
          "Client name, phone, email. Insurer name, claim number, adjuster name if known.",
      },
    ],
    confirmingQuestions: [
      {
        id: "ca_q1",
        question:
          "Has the property owner or authorised representative signed the authority form?",
        required: true,
      },
      {
        id: "ca_q2",
        question: "Have you recorded the insurer claim number?",
        required: false,
      },
    ],
    tips: [
      "If the person on site is not the property owner, confirm they have authority to grant access (e.g., tenant with landlord approval, strata manager).",
      "Always offer a copy of the signed authority form to the client.",
    ],
    commonMistakes: [
      "Starting work before getting signed authority — invalidates the entire inspection for insurance purposes.",
      "Not recording the claim number — causes delays when submitting the report.",
    ],
    experiencedAlerts: [],
  },

  damage_documentation: {
    subSteps: [
      {
        id: "dd_1",
        label: "Photograph the source/origin of damage",
        detail:
          "Identify and document where the water/damage originated — burst pipe, roof leak, appliance failure, etc.",
      },
      {
        id: "dd_2",
        label: "Take wide-angle room photos",
        detail:
          "One wide shot per affected room showing overall condition. Include ceiling, walls, and floor in frame.",
      },
      {
        id: "dd_3",
        label: "Take close-up damage photos",
        detail:
          "Detail shots of specific damage: watermarks, staining, delamination, swelling, mould growth. Include a scale reference where possible.",
      },
      {
        id: "dd_4",
        label: "Document non-affected reference areas",
        detail:
          "Photograph at least one unaffected area nearby as a baseline comparison.",
      },
    ],
    confirmingQuestions: [
      {
        id: "dd_q1",
        question: "Have you documented the source/origin point of damage?",
        required: true,
      },
      {
        id: "dd_q2",
        question:
          "Do you have both wide-angle and close-up photos for each affected area?",
        required: true,
      },
    ],
    tips: [
      "Use a ruler or tape measure in close-up photos for scale — S500:2025 requires measurable damage evidence.",
      "Photograph damage progression from source outward to show the path of water travel.",
    ],
    commonMistakes: [
      "Only taking close-ups without wide shots — adjusters need context to understand the extent of damage.",
      "Missing the origin/source point — the single most important photo for the claim.",
    ],
    experiencedAlerts: [
      "If source is ongoing (active leak), document and notify client immediately — do not wait until step completion.",
    ],
  },

  environmental_readings: {
    subSteps: [
      {
        id: "er_1",
        label: "Set up psychrometer / thermo-hygrometer",
        detail:
          "Allow sensor to acclimatise for 2 minutes before recording. Ensure device is calibrated (check calibration sticker date).",
      },
      {
        id: "er_2",
        label: "Record ambient temperature and relative humidity",
        detail:
          "Take readings at breathing height (~1.5m) in the centre of each affected room.",
      },
      {
        id: "er_3",
        label: "Calculate dew point",
        detail:
          "Use the device's built-in dew point calculation or the psychrometric chart. Record in the app.",
      },
      {
        id: "er_4",
        label: "Record an external/reference reading",
        detail:
          "Take one reading outside or in a confirmed dry, unaffected room as a baseline.",
      },
    ],
    confirmingQuestions: [
      {
        id: "er_q1",
        question:
          "Have you recorded temperature and humidity in every affected room?",
        required: true,
      },
      {
        id: "er_q2",
        question: "Have you taken a reference reading from an unaffected area?",
        required: true,
      },
      {
        id: "er_q3",
        question: "Is your psychrometer within its calibration period?",
        required: false,
      },
    ],
    tips: [
      "S500:2025 §7.3 requires environmental readings at each monitoring visit — not just the initial inspection.",
      "Record readings before turning on any drying equipment to establish a true baseline.",
    ],
    commonMistakes: [
      "Taking readings immediately after walking into a room — body heat and door opening affect readings. Wait 2 minutes.",
      "Forgetting to record external conditions — makes it impossible to calculate GPP differential.",
    ],
    experiencedAlerts: [],
  },

  moisture_mapping: {
    subSteps: [
      {
        id: "mm_1",
        label: "Pin-type meter readings on affected materials",
        detail:
          "Take readings at 300mm intervals along the moisture boundary. Record material type, depth setting, and reading value.",
      },
      {
        id: "mm_2",
        label: "Non-invasive (pinless) meter scan",
        detail:
          "Use capacitance meter to scan walls and floors for hidden moisture. Mark any elevated readings for follow-up pin testing.",
      },
      {
        id: "mm_3",
        label: "Map the moisture boundary",
        detail:
          "Identify and document where wet meets dry on every surface — this defines the affected area boundary.",
      },
      {
        id: "mm_4",
        label: "Record material-specific readings",
        detail:
          "Note the material type for each reading — timber, plasterboard, concrete, carpet. EMC targets differ by material.",
      },
    ],
    confirmingQuestions: [
      {
        id: "mm_q1",
        question:
          "Have you mapped the full moisture boundary (wet-to-dry transition) on all affected surfaces?",
        required: true,
      },
      {
        id: "mm_q2",
        question: "Are material types recorded for each moisture reading?",
        required: true,
      },
    ],
    tips: [
      "S500:2025 §10.2 requires moisture readings at material-appropriate depths — plasterboard at 12mm, timber framing at 50mm.",
      "Always take readings on the 'dry' side of the boundary too — proves where damage stops.",
    ],
    commonMistakes: [
      "Only testing the visibly wet area — the moisture boundary often extends 300-600mm beyond visible damage.",
      "Using the wrong scale on the pin meter — different materials have different reference scales.",
    ],
    experiencedAlerts: [
      "Concrete slab readings above 75% RH (in-situ probe): flag for extended drying — minimum 72hr monitoring.",
    ],
  },

  affected_area_mapping: {
    subSteps: [
      {
        id: "am_1",
        label: "Sketch or annotate the floor plan",
        detail:
          "Mark all affected rooms, areas, and the moisture boundary on a floor plan. Use the app's annotation tool or a hand sketch.",
      },
      {
        id: "am_2",
        label: "Measure affected area dimensions",
        detail:
          "Record length × width of each affected zone in metres. Note ceiling height if ceiling is affected.",
      },
      {
        id: "am_3",
        label: "Mark equipment placement locations",
        detail:
          "Indicate where dehumidifiers and air movers will be (or are) positioned on the floor plan.",
      },
    ],
    confirmingQuestions: [
      {
        id: "am_q1",
        question:
          "Does your floor plan show all affected areas with dimensions?",
        required: true,
      },
      {
        id: "am_q2",
        question: "Have you marked proposed equipment placement positions?",
        required: false,
      },
    ],
    tips: [
      "Insurers use the affected area map to verify scope — an accurate floor plan prevents scope disputes.",
    ],
    commonMistakes: [
      "Estimating room dimensions instead of measuring — a 10% error on a 50m² room changes the equipment calc significantly.",
    ],
    experiencedAlerts: [],
  },

  equipment_deployment: {
    subSteps: [
      {
        id: "ed_1",
        label: "Deploy equipment per IICRC guidelines",
        detail:
          "Air movers: 1 per 4.5m of wall run minimum. Dehumidifiers: sized to space volume and moisture load.",
      },
      {
        id: "ed_2",
        label: "Photograph each unit with serial number visible",
        detail:
          "Every deployed unit needs a photo showing the serial number / asset tag. This is your chain-of-custody proof.",
      },
      {
        id: "ed_3",
        label: "Record equipment details in the app",
        detail:
          "Log: equipment type, make/model, serial number, deployment location, and start time.",
      },
      {
        id: "ed_4",
        label: "Set and record initial equipment readings",
        detail:
          "Record initial run-hour meter reading, fan speed setting, and any relevant parameters.",
      },
    ],
    confirmingQuestions: [
      {
        id: "ed_q1",
        question:
          "Is every deployed unit photographed with its serial number visible?",
        required: true,
      },
      {
        id: "ed_q2",
        question:
          "Have you recorded the initial run-hour reading for each unit?",
        required: true,
      },
    ],
    tips: [
      "S500:2025 §12.1 requires documented evidence of equipment deployment — serial numbers are non-negotiable for insurers.",
    ],
    commonMistakes: [
      "Deploying equipment without photographing serial numbers — you will need to return to site to collect this evidence.",
    ],
    experiencedAlerts: [
      "Cat 3 jobs: negative air / HEPA filtration required before drying equipment. Document containment setup.",
    ],
  },

  scope_documentation: {
    subSteps: [
      {
        id: "sd_1",
        label: "List all damaged materials and finishes",
        detail:
          "Itemise every affected material: flooring type, wall lining, ceiling, skirting, architraves, cabinetry, insulation.",
      },
      {
        id: "sd_2",
        label: "Note restoration vs replacement decisions",
        detail:
          "For each item, record whether it can be restored or must be replaced, and why.",
      },
      {
        id: "sd_3",
        label: "Reference evidence for each scope item",
        detail:
          "Link moisture readings and photos to each scope line item — the evidence must support every scope decision.",
      },
    ],
    confirmingQuestions: [
      {
        id: "sd_q1",
        question:
          "Does every scope item have supporting evidence (moisture reading or photo)?",
        required: true,
      },
      {
        id: "sd_q2",
        question: "Have you noted restore-vs-replace rationale for each item?",
        required: false,
      },
    ],
    tips: [
      "A well-documented scope with linked evidence is the #1 factor in claim approval speed.",
    ],
    commonMistakes: [
      "Writing scope items without referencing specific evidence — adjusters will query every unsupported line item.",
    ],
    experiencedAlerts: [],
  },

  monitoring_review: {
    subSteps: [
      {
        id: "mr_1",
        label: "Take follow-up moisture readings at all mapped points",
        detail:
          "Repeat readings at the same locations as the initial moisture map. Record the same material types and depths.",
      },
      {
        id: "mr_2",
        label: "Record new environmental readings",
        detail:
          "Temperature, RH, and dew point in every affected room — compare to previous readings.",
      },
      {
        id: "mr_3",
        label: "Check equipment run hours",
        detail:
          "Record current run-hour meter on every unit. Calculate hours since last check.",
      },
      {
        id: "mr_4",
        label: "Assess drying progress",
        detail:
          "Compare current readings to targets. Note which areas are meeting goals and which need adjustment.",
      },
    ],
    confirmingQuestions: [
      {
        id: "mr_q1",
        question:
          "Have you taken readings at all previously mapped moisture points?",
        required: true,
      },
      {
        id: "mr_q2",
        question: "Have you updated equipment run-hour records?",
        required: true,
      },
    ],
    tips: [
      "S500:2025 requires monitoring at least every 24 hours for the first 72 hours of drying.",
    ],
    commonMistakes: [
      "Missing monitoring visits — gaps in the drying record weaken the claim and can void insurance coverage.",
    ],
    experiencedAlerts: [
      "If readings are not trending down after 48 hours, reassess equipment placement and containment.",
    ],
  },

  contamination_assessment: {
    subSteps: [
      {
        id: "ct_1",
        label: "Identify contamination source and category",
        detail:
          "Category 1 (clean), Category 2 (grey), or Category 3 (black/sewage). S500:2025 §3 definitions apply.",
      },
      {
        id: "ct_2",
        label: "Document PPE level in use",
        detail:
          "Photograph yourself or team member in full PPE appropriate to the contamination category.",
      },
      {
        id: "ct_3",
        label: "Collect samples if required",
        detail:
          "Cat 3 / mould: take air and surface samples per your company protocol. Label and photograph each sample.",
      },
    ],
    confirmingQuestions: [
      {
        id: "ct_q1",
        question: "Have you classified the contamination category (1/2/3)?",
        required: true,
      },
      {
        id: "ct_q2",
        question: "Is PPE appropriate to the contamination level?",
        required: true,
      },
    ],
    tips: [
      "Water that has been standing for more than 48 hours automatically escalates to Category 3 per S500:2025.",
    ],
    commonMistakes: [
      "Under-classifying contamination — Cat 2 left untreated for 48+ hours becomes Cat 3, changing the entire scope.",
    ],
    experiencedAlerts: [
      "Cat 3: containment, negative air, PPE Level C minimum. Document containment barriers before any work.",
    ],
  },

  mould_assessment: {
    subSteps: [
      {
        id: "ma_1",
        label: "Photograph all visible mould with scale reference",
        detail:
          "Use a ruler in frame. Photograph colour, texture, and extent of growth on each surface.",
      },
      {
        id: "ma_2",
        label: "Note affected material types",
        detail:
          "Record the substrate: plasterboard, timber, tile grout, carpet, etc. Remediation method depends on material.",
      },
      {
        id: "ma_3",
        label: "Collect air and surface samples",
        detail:
          "Air samples: minimum one affected area + one outdoor control. Surface: tape-lift or swab per protocol.",
      },
    ],
    confirmingQuestions: [
      {
        id: "ma_q1",
        question:
          "Have you taken photos of all visible mould growth with a scale reference?",
        required: true,
      },
      {
        id: "ma_q2",
        question: "Have you collected both air and surface samples?",
        required: false,
      },
    ],
    tips: [
      "Always photograph mould before disturbing it — agitation releases spores and changes the visible pattern.",
    ],
    commonMistakes: [
      "Disturbing mould before photographing — once disturbed, the original growth pattern cannot be documented.",
    ],
    experiencedAlerts: [
      "Mould area > 3m²: specialist remediation protocol required. Do not attempt general cleaning.",
    ],
  },

  fire_smoke_assessment: {
    subSteps: [
      {
        id: "fs_1",
        label: "Document fire origin and char patterns",
        detail:
          "Photograph the point of origin, V-patterns, char depth, and smoke/soot distribution.",
      },
      {
        id: "fs_2",
        label: "Assess structural integrity",
        detail:
          "Note any structural concerns: exposed framing, compromised load paths, fire-damaged connections.",
      },
      {
        id: "fs_3",
        label: "Document smoke and soot damage",
        detail:
          "Photograph soot deposits on walls, ceilings, contents. Note smoke odour intensity by room.",
      },
    ],
    confirmingQuestions: [
      {
        id: "fs_q1",
        question:
          "Have you documented the fire origin point and burn patterns?",
        required: true,
      },
      {
        id: "fs_q2",
        question: "Have you noted any structural integrity concerns?",
        required: true,
      },
    ],
    tips: [
      "V-pattern documentation is critical for origin determination — photograph from multiple angles.",
    ],
    commonMistakes: [
      "Not documenting smoke damage in seemingly unaffected rooms — smoke travels far beyond visible fire damage.",
    ],
    experiencedAlerts: [
      "If structural integrity is questionable, do not enter. Engage structural engineer before proceeding.",
    ],
  },
};

// ============================================
// DEFAULT GUIDANCE (for steps without specific definitions)
// ============================================

const DEFAULT_GUIDANCE: StepGuidance = {
  subSteps: [],
  confirmingQuestions: [],
  tips: [],
  commonMistakes: [],
  experiencedAlerts: [],
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get guidance for a workflow step by its stepKey.
 * Returns default empty guidance if no specific guidance is defined.
 */
export function getStepGuidance(stepKey: string): StepGuidance {
  return STEP_GUIDANCE[stepKey] ?? DEFAULT_GUIDANCE;
}

/**
 * Check if a step has any apprentice-specific guidance content.
 */
export function hasApprenticeGuidance(stepKey: string): boolean {
  const g = getStepGuidance(stepKey);
  return (
    g.subSteps.length > 0 ||
    g.confirmingQuestions.length > 0 ||
    g.tips.length > 0 ||
    g.commonMistakes.length > 0
  );
}

/**
 * Check if a step has experienced-mode alerts (exception-only prompts).
 */
export function hasExperiencedAlerts(stepKey: string): boolean {
  const g = getStepGuidance(stepKey);
  return g.experiencedAlerts.length > 0;
}

/**
 * Get only the required confirming questions for a step.
 * Used in apprentice mode to gate step completion.
 */
export function getRequiredConfirmations(
  stepKey: string,
): ConfirmingQuestion[] {
  const g = getStepGuidance(stepKey);
  return g.confirmingQuestions.filter((q) => q.required);
}

/**
 * For experienced mode: determine if step needs any attention
 * beyond just capturing evidence (risk tier >= 2 or has alerts).
 */
export function needsExperiencedAttention(
  stepKey: string,
  riskTier: number,
): boolean {
  return riskTier >= 2 || hasExperiencedAlerts(stepKey);
}
