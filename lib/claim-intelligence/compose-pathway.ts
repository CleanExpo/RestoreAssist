/**
 * RA-8276 step 1: the deterministic Claim Pathway engine, for every claim
 * type.
 *
 * `composePathway(facts)` turns claim facts into two views of one data set:
 *   - techPathway: an ordered tick-and-flick checklist for the technician;
 *   - customerBrief: a plain-English "understand your claim" brief.
 *
 * Rules this module keeps:
 *   - Pure. No AI, no network, no clock, no randomness: the same input always
 *     gives the same output.
 *   - Every item is `proposed`. The technician confirms, changes or rejects it.
 *   - Anything unknown becomes an "investigate on site" item. No defaults are
 *     invented. The one deliberate exception is sewage, which is Category 3 by
 *     definition; treating it as anything lower would under-protect the crew.
 *   - IICRC citations come only from `standardCite()`; WHS citations only from
 *     `whs-sources.ts`. The customer view never shows prices or unverified
 *     clause numbers.
 *
 * It composes the existing owners rather than re-deriving them:
 * `normalizeClaimType`, `getWorkflowTemplate`, `getStepGuidance`,
 * `claimRecommendations`, `requiredPpe` and `summarisePpe`.
 */
import { normalizeClaimType } from "@/lib/evidence/claim-type";
import {
  getWorkflowTemplate,
  JOB_TYPE_LABELS,
  type JobType,
  type WorkflowStepDefinition,
} from "@/lib/evidence/workflow-definitions";
import { ASBESTOS_PRESUMPTION_YEAR } from "@/lib/compliance/asbestos-era";
import { getStepGuidance } from "@/lib/evidence/adaptive-guidance";
import type { EvidenceClass } from "@/lib/types/evidence";
import {
  applicableStandard,
  standardCite,
  type StandardKey,
} from "@/lib/nir-standards-mapping";
import {
  claimRecommendations,
  type ClaimHazardInputs,
  type Recommendation,
  type RecCategory,
} from "@/lib/restoration/claim-recommendations";
import { requiredPpe, summarisePpe } from "@/lib/restoration/ppe-requirements";
import {
  whsCustomerLabel,
  whsSourceApplies,
  whsTechLabel,
  type WhsSourceKey,
} from "./whs-sources";
import {
  PATHWAY_SECTIONS,
  type ClaimFacts,
  type ClaimPathway,
  type CustomerBrief,
  type EvidenceRequirement,
  type EvidenceType,
  type PathwayItem,
  type PathwaySection,
} from "./types";

/** Presume asbestos before this build year (AU, from the regulatory registry). */
const ASBESTOS_YEAR = ASBESTOS_PRESUMPTION_YEAR.AU;

export class UnknownClaimTypeError extends Error {
  constructor(raw: string) {
    super(`Unknown claim type: ${JSON.stringify(raw)}`);
    this.name = "UnknownClaimTypeError";
  }
}

const STANDARD_TOPIC: Record<StandardKey, string> = {
  S500: "water damage restoration",
  S520: "mould remediation",
  S540: "trauma and crime scene cleanup",
  S700: "fire and smoke damage restoration",
  S100: "carpet cleaning",
};

const MOULD_CONDITION_LABEL: Record<number, string> = {
  1: "Condition 1 (normal fungal ecology)",
  2: "Condition 2 (settled spores)",
  3: "Condition 3 (actual growth)",
};

const RESIDUE_LABEL: Record<string, string> = {
  protein: "protein",
  dry: "dry smoke",
  wet: "wet smoke",
  fuel_oil: "fuel oil soot",
};

// ── Small helpers ──────────────────────────────────────────────────────────

function evidenceTypeOf(cls: EvidenceClass): EvidenceType {
  switch (cls) {
    case "MOISTURE_READING":
    case "AMBIENT_ENVIRONMENTAL":
    case "THERMAL_IMAGE":
    case "EQUIPMENT_LOG":
      return "reading";
    case "LAB_RESULT":
      return "test";
    case "PHOTO_DAMAGE":
    case "PHOTO_EQUIPMENT":
    case "PHOTO_PROGRESS":
    case "PHOTO_COMPLETION":
    case "VIDEO_WALKTHROUGH":
    case "FLOOR_PLAN":
      return "photo";
    default:
      return "note";
  }
}

function ev(
  evidenceClass: EvidenceClass,
  minCount: number,
  type: EvidenceType = evidenceTypeOf(evidenceClass),
): EvidenceRequirement {
  return { evidenceClass, minCount, type };
}

const NOTE = (n = 1) => ev("TECHNICIAN_NOTE", n, "note");

function firstSentence(text: string): string {
  const m = text.match(/^.*?[.:](\s|$)/);
  return (m ? m[0] : text).trim();
}

function known<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}

// ── Engine ─────────────────────────────────────────────────────────────────

interface Draft {
  item: PathwayItem;
  /** Plain-English line for the customer brief, or none. */
  customer?: { bucket: "properScope" | "toConfirm"; line: string };
}

export function composePathway(facts: ClaimFacts): ClaimPathway {
  const claimType = normalizeClaimType(facts.claimType);
  if (!claimType) throw new UnknownClaimTypeError(facts.claimType);

  const hz = facts.hazards ?? {};
  const prop = facts.property ?? {};
  const loss = facts.loss ?? {};
  const rooms = (loss.affectedRooms ?? []).filter((r) => r.trim() !== "");
  const state = prop.state ?? null;

  const fire = claimType === "FIRE_SMOKE" || Boolean(hz.fireSmoke);
  // Sewage is Category 3 by definition (see module note).
  const waterCategory =
    loss.waterCategory ?? (claimType === "SEWAGE" ? "3" : null);
  const waterClass = loss.waterClass ?? null;
  const waterPresent =
    known(waterCategory) ||
    known(waterClass) ||
    claimType === "WATER_DAMAGE" ||
    claimType === "SEWAGE";
  const mould = (hz.mouldCondition ?? 0) >= 2;

  const hazard: ClaimHazardInputs = {
    ...hz,
    fireSmoke: fire,
    waterCategory,
    waterClass,
    waterPresent,
    storeys: prop.storeys ?? null,
    ceilingHeightM: prop.ceilingHeightM ?? null,
  };

  // ── Standards, lead first ────────────────────────────────────────────────
  const standards: StandardKey[] = [];
  const addStd = (k: StandardKey) => {
    if (!standards.includes(k)) standards.push(k);
  };
  if (claimType === "FIRE_SMOKE") addStd("S700");
  if (
    claimType === "WATER_DAMAGE" ||
    claimType === "SEWAGE" ||
    (claimType === "STORM" && waterPresent)
  ) {
    addStd("S500");
  }
  if (claimType === "MOULD") addStd("S520");
  if (fire) addStd("S700");
  if (waterPresent) addStd("S500");
  if (mould || claimType === "MOULD") addStd("S520");
  if (hz.biohazard) addStd("S540");
  const lead = standards[0];
  const leadCite = lead ? `IICRC ${standardCite(lead)}` : null;

  const ppe = requiredPpe(hazard);
  const drafts: Draft[] = [];
  const whsUsed = new Set<WhsSourceKey>();
  const whs = (...keys: WhsSourceKey[]): string[] =>
    keys
      .filter((k) => whsSourceApplies(k, state))
      .map((k) => {
        whsUsed.add(k);
        return whsTechLabel(k);
      });

  const push = (
    item: Omit<PathwayItem, "status">,
    customer?: Draft["customer"],
  ) => drafts.push({ item: { ...item, status: "proposed" }, customer });

  // ── Safety ───────────────────────────────────────────────────────────────
  // Asbestos: built before the AU presumption year (from the regulatory
  // registry), or unknown: required. From that year on: advisory (recycled or
  // imported materials are possible).
  {
    const year = prop.buildYear;
    let severity: PathwayItem["severity"] = "required";
    let action: string;
    if (hz.asbestos) {
      action =
        "Asbestos suspected: stop. Do not disturb any material. Engage a licensed asbestos assessor before work continues.";
    } else if (!known(year)) {
      action =
        "Check for asbestos before disturbing any material: the build year is not known.";
    } else if (year < ASBESTOS_YEAR) {
      action = `Check for asbestos before disturbing any material: the building was built in ${year}, before ${ASBESTOS_YEAR}.`;
    } else {
      severity = "advisory";
      action = `Asbestos is unlikely in a building from ${year}, but check before disturbing any material that looks recycled or imported.`;
    }
    push({
      id: "safety.asbestos",
      section: "safety",
      severity,
      action,
      why: "Asbestos may be present in buildings constructed before 31 December 2003, and possibly later. Damage from the loss can make bonded asbestos friable.",
      basis: whs("asbestos-cop"),
      evidence: [NOTE()],
      guidance: {
        apprentice:
          "Before you cut, sand or remove anything, look for fibre cement sheeting, old vinyl, lagging and textured coatings. If in doubt, stop and ask your supervisor; never disturb it to find out.",
        experienced:
          "ACM check before any disturbance; licensed assessor if suspected.",
      },
    });
  }

  if (fire) {
    const near = loss.originRoom ? ` in the ${loss.originRoom}` : "";
    push(
      {
        id: "safety.electrical-near-origin",
        section: "safety",
        severity: "required",
        action: `Isolate light fittings, power points and appliances near the fire origin${near}. A licensed electrician inspects them before they are cleaned or re-energised. Photograph heat-affected fittings and melted plastics.`,
        why: "Heat can damage wiring and fittings that still look intact. Cleaning or switching them on before inspection is an electrical risk.",
        basis: whs("electrical-cop"),
        evidence: [ev("PHOTO_DAMAGE", 1)],
        guidance: {
          apprentice:
            "Do not touch or clean any fitting near the origin until the circuit is isolated and the electrician has checked it. Photograph each fitting and any melted plastic before anything is moved.",
          experienced:
            "Isolate near-origin circuits; licensed electrician sign-off before clean or re-energise.",
        },
      },
      {
        bucket: "properScope",
        line: "Electrical fittings near where the fire started are isolated and checked by a licensed electrician before anyone cleans or switches them on.",
      },
    );
  }

  // ── PPE ──────────────────────────────────────────────────────────────────
  {
    const escalations = ppe.escalations.join(" ");
    push({
      id: "ppe.set",
      section: "ppe",
      severity: "required",
      action: `PPE for this job: ${summarisePpe(ppe)}`,
      why: "The hazards on this job set the minimum protection. The strictest hazard present wins.",
      basis: [...(leadCite ? [leadCite] : []), ...whs("nsw-whs-reg-ppe")],
      evidence: [NOTE()],
      guidance: {
        apprentice: `Put this PPE on before you enter the affected area and keep it on until you leave.${escalations ? ` ${escalations}` : ""}`,
        experienced: escalations || "Standard set for this hazard profile.",
      },
    });
    if (ppe.respiratory !== "none") {
      push({
        id: "ppe.fit-test",
        section: "ppe",
        severity: "required",
        action: `Every wearer of a close-fitting ${ppe.respiratory} respirator has an individual fit test on record and does a fit check each time it goes on.`,
        why: "A respirator that does not seal does not protect. It cannot be worn over facial hair at the seal.",
        basis: whs("rpe-fit-testing"),
        evidence: [ev("COMPLIANCE_CERTIFICATE", 1, "note")],
        guidance: {
          apprentice:
            "Your fit test is personal to you and your mask model. Every time you put the mask on, cover it and breathe in and out to check the seal. If you have stubble at the seal, the mask will not protect you.",
          experienced:
            "Fit-test record per wearer; fit check on every don; clean-shaven seal.",
        },
      });
    }
  }

  // ── Standards ────────────────────────────────────────────────────────────
  for (const k of standards) {
    const adoption = state ? applicableStandard(k, "AU") : null;
    const cite = `IICRC ${standardCite(k)}`;
    push({
      id: `standards.${k}`,
      section: "standards",
      severity: "required",
      action:
        k === lead
          ? `Lead standard: work to ${cite}${adoption ? ` (${adoption} governs in Australia)` : ""}.`
          : `Also applies: ${cite}${adoption ? ` (${adoption} governs in Australia)` : ""}.`,
      why: `The industry standard for ${STANDARD_TOPIC[k]}.`,
      basis: [cite],
      evidence: [],
      guidance: {
        apprentice: `Every step below is written to ${cite}. If something on site does not fit the steps, stop and record why before you change the method.`,
        experienced: `Record any departure from ${cite} and the reason.`,
      },
    });
  }
  if (standards.length === 0) {
    push(
      {
        id: "investigate.damage-type",
        section: "investigate",
        severity: "required",
        action:
          "Confirm the type of damage (water, mould, fire or smoke, biohazard) so the governing standard can be set.",
        why: "No standard can be applied until the damage type is known.",
        basis: [],
        evidence: [NOTE()],
        guidance: {
          apprentice:
            "Walk the affected area and record what caused the damage. Water, mould, smoke and biohazards each change the method and the PPE.",
          experienced: "Classify the damage type on arrival.",
        },
      },
      {
        bucket: "toConfirm",
        line: "The type of damage, which decides the standard the work follows.",
      },
    );
  }

  // ── Investigate: every unknown fact ──────────────────────────────────────
  const investigate = (
    id: string,
    action: string,
    why: string,
    customerLine: string,
    evidence: EvidenceRequirement[] = [NOTE()],
  ) =>
    push(
      {
        id: `investigate.${id}`,
        section: "investigate",
        severity: "required",
        action,
        why,
        basis: [],
        evidence,
        guidance: { apprentice: `${action} ${why}`, experienced: action },
      },
      { bucket: "toConfirm", line: customerLine },
    );

  if (!known(loss.lossDate)) {
    investigate(
      "loss-date",
      "Confirm the date of loss.",
      "Elapsed time changes the risk of secondary damage and mould.",
      "When the damage happened.",
    );
  }
  if (!loss.originRoom) {
    investigate(
      "origin",
      fire ? "Locate the fire origin." : "Locate the source of the damage.",
      "The origin sets where damage is heaviest and where electrical and structural checks start.",
      fire ? "Where the fire started." : "Where the damage started.",
    );
  }
  if (rooms.length === 0) {
    investigate(
      "affected-rooms",
      "Walk every room and record which are affected.",
      "Per-room tests and scope lines depend on the list of affected rooms.",
      "Which rooms are affected.",
    );
  }
  if (!known(prop.storeys)) {
    investigate(
      "storeys",
      "Confirm the number of storeys.",
      "Two or more storeys makes working at height required.",
      "How many storeys the home has.",
    );
  }
  if (!known(prop.ceilingHeightM)) {
    investigate(
      "ceiling-height",
      "Measure ceiling heights in the affected rooms.",
      "Ceilings of 2.4 m or more make working at height required.",
      "Ceiling heights.",
      [ev("TECHNICIAN_NOTE", 1, "reading")],
    );
  }
  if (!known(prop.buildYear)) {
    investigate(
      "build-year",
      "Confirm the build year.",
      `Buildings before ${ASBESTOS_YEAR} need an asbestos check before any material is disturbed.`,
      "When the home was built, which decides the asbestos check.",
    );
  }
  if (!known(prop.furnished)) {
    investigate(
      "furnished",
      "Confirm whether contents are present.",
      "Contents add sorting, pack-out and storage steps.",
      "Whether furniture and belongings are in the affected areas.",
    );
  }
  if (fire) {
    const hint = loss.smokeResidueHint;
    if (hint && hint !== "unknown") {
      investigate(
        "residue-type",
        `Confirm the reported residue type (${RESIDUE_LABEL[hint]}) with the residue test.`,
        "The intake description is a lead, not a finding. Residue type sets the cleaning method.",
        `The smoke residue type. It was reported as ${RESIDUE_LABEL[hint]}, and a test on site confirms it.`,
      );
    } else {
      investigate(
        "residue-type",
        "Identify the residue type (protein, dry smoke, wet smoke or fuel oil soot) with the residue test.",
        "Residue type sets the cleaning method.",
        "The smoke residue type, found by testing on site.",
      );
    }
  }
  if (fire || claimType === "MOULD" || mould) {
    const hvac = prop.hvacType;
    if (!known(hvac) || hvac === "unknown") {
      investigate(
        "hvac-type",
        "Identify the HVAC type (split, ducted or none).",
        fire
          ? "Ducted systems spread smoke residue through the whole house."
          : "Ducted systems spread spores through the whole house.",
        "What kind of air-conditioning the home has.",
      );
    }
    if (hvac !== "none" && !known(prop.hvacRanSinceLoss)) {
      investigate(
        "hvac-ran",
        `Ask whether the HVAC ran after the ${fire ? "fire" : "loss"}.`,
        "If it ran, the duct and filter inspection is required.",
        `Whether the air-conditioning ran after the ${fire ? "fire" : "damage"}.`,
      );
    }
    if (hvac !== "none" && prop.hvacRanSinceLoss === true) {
      push(
        {
          id: "evidence.hvac-ducts-filters",
          section: "evidence",
          severity: "required",
          action:
            "Inspect HVAC filters, returns and accessible ducts; photograph them and record the filter condition.",
          why: `The system ran after the ${fire ? "fire" : "loss"}, so it may have moved ${fire ? "residue" : "spores"} through the building.`,
          basis: leadCite ? [leadCite] : [],
          evidence: [ev("PHOTO_DAMAGE", 2), NOTE()],
          guidance: {
            apprentice:
              "Isolate the system first. Open the return grille, photograph the filter before you remove it, then photograph inside the return and any duct you can reach.",
            experienced:
              "Isolate; photograph filter, return and accessible ducts.",
          },
        },
        {
          bucket: "properScope",
          line: "The air-conditioning filters and ducts are inspected, because the system ran after the damage.",
        },
      );
    }
  }
  if (waterPresent && !known(waterCategory)) {
    investigate(
      "water-category",
      "Determine the water category (1, 2 or 3).",
      "Category sets PPE and whether porous materials can be kept. Until it is known, wear PPE for Category 3.",
      "The water category, which decides what can be dried and what must be removed.",
    );
  }
  if (waterPresent && !known(waterClass)) {
    investigate(
      "water-class",
      "Determine the water class (1 to 4).",
      "Class sets the drying equipment and method.",
      "The water class, which decides the drying equipment.",
    );
  }
  if (claimType === "STORM" && !waterPresent) {
    investigate(
      "storm-water-entry",
      "Check whether water entered the building.",
      "Water entry adds the water damage steps.",
      "Whether water got inside the building.",
    );
  }
  if (claimType === "MOULD" && !known(hz.mouldCondition)) {
    investigate(
      "mould-condition",
      "Determine the mould condition (1, 2 or 3).",
      "Condition sets containment, PPE and clearance.",
      "How far the mould has developed.",
    );
  }

  // ── Fire and smoke checks (defect 4) ─────────────────────────────────────
  if (fire) {
    const s700 = `IICRC ${standardCite("S700")}`;
    const roomCount = Math.max(1, rooms.length);
    push(
      {
        id: "evidence.residue-test",
        section: "evidence",
        severity: "required",
        action:
          "Residue test (wipe or tape) in each affected room: once before cleaning and again after.",
        why: "Proves what residue is present and that cleaning removed it. The before-and-after pair is the clearance record.",
        basis: [s700],
        evidence: [ev("PHOTO_DAMAGE", 2 * roomCount, "test")],
        guidance: {
          apprentice:
            "Wipe a dry chemical sponge or press clear tape on a wall and a ceiling in each room. Photograph the result next to a room label. Repeat in the same spots after cleaning.",
          experienced: "Per-room wipe/tape test, pre and post, same locations.",
        },
      },
      {
        bucket: "properScope",
        line: "A residue test in each affected room before and after cleaning, so the result is measured rather than guessed.",
      },
    );
    push(
      {
        id: "evidence.odour-baseline-clearance",
        section: "evidence",
        severity: "required",
        action:
          "Record an odour baseline in each affected room before work, and an odour clearance check after.",
        why: "Odour is the most common reason a smoke clean is disputed. A recorded baseline gives the clearance check something to compare against.",
        basis: [s700],
        evidence: [ev("TECHNICIAN_NOTE", 2 * roomCount, "reading")],
        guidance: {
          apprentice:
            "Rate the odour in each room on arrival (none, faint, moderate, strong) after the room has been closed up. Do the same check, the same way, at completion.",
          experienced:
            "Baseline and clearance odour rating per room, same method.",
        },
      },
      {
        bucket: "properScope",
        line: "An odour check in each room before work and again at the end, compared against each other.",
      },
    );
    push(
      {
        id: "evidence.cleanability-patch",
        section: "evidence",
        severity: "required",
        action:
          "Test-clean a patch on each surface type (for example paint, ceiling, timber, stone, fabric) and photograph it before and after.",
        why: 'This is the evidence that answers "it can\'t be cleaned": a surface is only proposed for replacement when its test patch shows it does not clean.',
        basis: [s700],
        evidence: [ev("PHOTO_PROGRESS", 2, "test")],
        guidance: {
          apprentice:
            "Pick a small, out-of-sight patch on each different surface. Photograph it, clean it with the method for the residue type, then photograph it again from the same angle.",
          experienced:
            "One test patch per surface type, before and after photos.",
        },
      },
      {
        bucket: "properScope",
        line: "A test clean on each surface type before any surface is called uncleanable. Replacement is only proposed where the test shows it.",
      },
    );
    push(
      {
        id: "scope.smoke-clean",
        section: "scope",
        severity: "required",
        action:
          "Clean smoke residue from ceilings, walls, fittings and surfaces in each affected room, using the method each test patch proved.",
        why: "Residue left in place keeps corroding and off-gassing odour.",
        basis: [s700],
        evidence: [ev("PHOTO_PROGRESS", roomCount)],
        guidance: {
          apprentice:
            "Work top down: ceilings, then walls, then fittings and floors. Use the method the test patch proved for each surface.",
          experienced: "Top-down clean per proven method.",
        },
      },
      {
        bucket: "properScope",
        line: "Cleaning of ceilings, walls and fittings in each affected room, top down, using the method the test clean proved.",
      },
    );
    push(
      {
        id: "scope.air-filtration",
        section: "scope",
        severity: "advisory",
        action:
          "Run HEPA air filtration while cleaning; add carbon filtration where odour is present.",
        why: "Cleaning puts fine soot back in the air. Filtration captures it, and carbon helps with odour.",
        basis: [s700],
        evidence: [ev("PHOTO_EQUIPMENT", 1)],
        guidance: {
          apprentice:
            "Place the air scrubber so it pulls air away from where you are working. Photograph it in place with its filter type visible.",
          experienced: "HEPA scrubbers during works; carbon where odour.",
        },
      },
      {
        bucket: "properScope",
        line: "Air filtration while cleaning, to catch fine soot stirred up by the work.",
      },
    );
    if (prop.furnished === true) {
      push(
        {
          id: "scope.contents-sort",
          section: "scope",
          severity: "required",
          action:
            "Sort contents into three groups: clean on site, pack out, and non-salvageable. Photograph each group and list the non-salvageable items.",
          why: "Sorting first keeps salvageable items out of the disposal pile and gives the insurer a record of every decision.",
          basis: [s700],
          evidence: [ev("PHOTO_DAMAGE", 3), NOTE()],
          guidance: {
            apprentice:
              "Label three zones. Every item goes into one zone and is photographed there. Never dispose of an item before it is photographed and listed.",
            experienced:
              "Three-way contents sort; photo and list non-salvageable.",
          },
        },
        {
          bucket: "properScope",
          line: "Your belongings sorted into clean on site, pack out, and non-salvageable, with every item photographed and listed before anything is thrown away.",
        },
      );
      push(
        {
          id: "scope.storage-plan",
          section: "scope",
          severity: "required",
          action:
            "Set an on-site storage plan (for example a garage or a cleaned room kept as a clean room) so cleaned contents are not re-contaminated.",
          why: "Cleaned items put back into a room that has not been cleaned pick up residue again.",
          basis: [s700],
          evidence: [NOTE(), ev("PHOTO_PROGRESS", 1)],
          guidance: {
            apprentice:
              "Agree the storage space with the customer. Clean it first, photograph it, and keep cleaned items covered there until their room is finished.",
            experienced: "Clean-room storage agreed and photographed.",
          },
        },
        {
          bucket: "properScope",
          line: "A clean storage space on site, so cleaned belongings are not exposed to smoke residue again.",
        },
      );
    }
  }

  // ── Workflow template steps (primary + overlays) ─────────────────────────
  const template = getWorkflowTemplate(claimType);
  // Water-only steps (psychrometric baseline, moisture mapping, drying
  // monitoring) stay out of a pathway with no water. Mould keeps them: finding
  // the moisture source is part of the mould work itself.
  const keepWaterSteps = waterPresent || claimType === "MOULD";
  const dryTemplate = !keepWaterSteps;
  const steps: WorkflowStepDefinition[] = template.steps.filter(
    (s) => keepWaterSteps || !s.waterOnly,
  );
  const has = (key: string) => steps.some((s) => s.stepKey === key);
  const borrow = (from: JobType, key: string) => {
    if (has(key)) return;
    const step = getWorkflowTemplate(from).steps.find((s) => s.stepKey === key);
    if (step) steps.push(step);
  };
  if (waterPresent) {
    // A fire job with water also needs the drying baseline.
    borrow("WATER_DAMAGE", "environmental_readings");
    borrow("WATER_DAMAGE", "moisture_survey");
    borrow("WATER_DAMAGE", "progress_monitoring");
    borrow("WATER_DAMAGE", "equipment_deployment");
    if (waterCategory === "2" || waterCategory === "3") {
      borrow("WATER_DAMAGE", "contamination_assessment");
    }
  }
  if (mould) borrow("MOULD", "mould_sampling");

  for (const step of steps) {
    const g = getStepGuidance(step.stepKey);
    // Shared steps written for water jobs (floor plan with moisture
    // boundaries, scope with drying, completion at drying goal) get dry
    // wording on a job with no water, and lose the moisture reading.
    const dryText =
      dryTemplate && DRY_TRIGGER.test(step.stepDescription)
        ? DRY_STEP_TEXT[step.stepKey]
        : undefined;
    const allReq = step.requiredEvidenceClasses;
    const req = dryTemplate
      ? allReq.filter((c) => c !== "MOISTURE_READING")
      : allReq;
    const minimum = Math.max(
      req.length,
      step.minimumEvidenceCount - (allReq.length - req.length),
    );
    const evidence = req.map((cls, i) =>
      ev(cls, i === 0 ? Math.max(1, minimum - (req.length - 1)) : 1),
    );
    const subSteps = g.subSteps.map((s) => s.label).join("; ");
    const description = dryText?.description ?? step.stepDescription;
    const descriptionShort = dryText?.short ?? step.stepDescriptionShort;
    // Mould claims keep their moisture wording, as the tech steps do.
    const customerLine = customerLineForStep(
      step.stepKey,
      fire,
      keepWaterSteps,
    );
    push(
      {
        id: `workflow.${step.stepKey}`,
        section: sectionForStep(step.stepKey),
        severity: step.isMandatory ? "required" : "advisory",
        action: step.stepTitle,
        why:
          step.escalationNote ??
          `Minimum evidence for this step in the ${JOB_TYPE_LABELS[claimType]} workflow.`,
        basis: leadCite ? [leadCite] : [],
        evidence,
        guidance: {
          apprentice: subSteps
            ? `${description} Steps: ${subSteps}.`
            : description,
          experienced: [
            descriptionShort,
            // Shared guidance is keyed by stepKey and some alerts are written
            // for water jobs only; keep them out of a pathway with no water.
            ...g.experiencedAlerts.filter(
              (a) => keepWaterSteps || !WATER_ALERT.test(a),
            ),
          ].join(" "),
        },
      },
      customerLine ? { bucket: "properScope", line: customerLine } : undefined,
    );
  }

  // Water on a job whose own completion step does not prove dryness.
  const completion = steps.find((s) => s.stepKey === "completion_verification");
  if (
    waterPresent &&
    completion &&
    !completion.requiredEvidenceClasses.includes("MOISTURE_READING")
  ) {
    push(
      {
        id: "evidence.final-moisture-readings",
        section: "evidence",
        severity: "required",
        action:
          "Take final moisture readings at the drying goal in every wet area before sign-off.",
        why: "Water is present on this job, so completion must prove materials are dry.",
        basis: [`IICRC ${standardCite("S500")}`],
        evidence: [ev("MOISTURE_READING", 1)],
        guidance: {
          apprentice:
            "Read the same points you mapped on day one and compare them with a dry reference reading of the same material.",
          experienced:
            "Final readings at goal, same points as the moisture map.",
        },
      },
      {
        bucket: "properScope",
        line: "Final moisture readings before sign-off, to prove wet materials are dry.",
      },
    );
  }

  // ── Hazard-driven recommendations ────────────────────────────────────────
  const counters: Partial<Record<RecCategory, number>> = {};
  for (const rec of claimRecommendations(hazard)) {
    const n = (counters[rec.category] = (counters[rec.category] ?? 0) + 1);
    drafts.push(recToDraft(rec, n, whs));
  }

  // ── Order by section, then insertion ─────────────────────────────────────
  const rank = (s: PathwaySection) => PATHWAY_SECTIONS.indexOf(s);
  const ordered = drafts
    .map((d, i) => ({ d, i }))
    .sort(
      (a, b) => rank(a.d.item.section) - rank(b.d.item.section) || a.i - b.i,
    )
    .map(({ d }) => d);

  const techPathway = ordered.map((d) => d.item);
  const customerBrief = buildCustomerBrief({
    claimType,
    facts,
    rooms,
    waterCategory,
    waterClass,
    standards,
    state,
    whsUsed,
    fire,
    waterPresent,
    mould,
    drafts: ordered,
  });

  return {
    claimType,
    standards,
    waterPresent,
    ppe,
    techPathway,
    customerBrief,
  };
}

const WATER_ALERT =
  /\bCat(egory)?\s?[123]\b|drying|moisture|dehumidif|psychromet|dew point|air.?mover|S500/i;

/**
 * Dry wording for shared template steps that are written for water jobs.
 * Used only when the pathway has no water and the claim is not mould, and
 * only when the step's own description carries water wording.
 */
/** Water wording in a shared step description, including plain "water" and "wet". */
const DRY_TRIGGER = new RegExp(
  `${WATER_ALERT.source}|\\bwater\\b|\\bwet\\b`,
  "i",
);

const DRY_STEP_TEXT: Record<string, { description: string; short: string }> = {
  floor_plan_sketch: {
    description:
      "Create or annotate a floor plan showing all affected areas and where each photo, test and reading was taken. Mark room dimensions if creating from scratch. This becomes the reference document for the scope.",
    short: "Annotated floor plan with affected areas and evidence points.",
  },
  scope_of_works: {
    description:
      "Document the full scope of restoration works required. Include demolition, cleaning, repairs and any specialist works. Reference affected areas and evidence collected.",
    short: "Full scope document referencing evidence collected.",
  },
  completion_verification: {
    description:
      "Photograph restored areas showing the completion standard, record the final result of every test taken during the works, and obtain client sign-off on completed works.",
    short: "Completion photos, final test results and client sign-off.",
  },
  structural_assessment: {
    description:
      "Assess structural integrity of affected areas. Check for sagging ceilings, warped or charred framing, foundation cracks and damaged bearers/joists. If structural compromise is suspected, recommend structural engineer. Document all observations with photos and measurements.",
    short: "Check structure + refer engineer if compromised.",
  },
  make_safe_actions: {
    description:
      "Perform immediate stabilisation (make-safe): isolate electrical where wiring is damaged, board up broken windows/doors, tarp damaged roof areas, remove trip hazards. Photograph before AND after each stabilisation action.",
    short: "Isolate hazards + secure openings + before/after photos.",
  },
  strata_common_areas: {
    description:
      "Inspect common areas (corridors, stairwells, basement) and adjacent lots for spread of the damage. Record which lots are affected and contact strata manager. Document common property vs lot property boundaries.",
    short: "Common areas + adjacent lots + strata boundary docs.",
  },
  contamination_assessment: {
    description:
      "Assess the contamination: document its source and type (biohazard, chemical or other), the affected materials and the PPE level in use. Take samples for lab analysis if the contaminant is uncertain.",
    short: "Contamination source and type, PPE level, samples if needed.",
  },
};

/** Plain-English customer line for a workflow step, where one helps. */
function customerLineForStep(
  stepKey: string,
  fire: boolean,
  water: boolean,
): string | null {
  switch (stepKey) {
    case "hazmat_assessment":
      return "A check for hazardous materials before anything is disturbed.";
    case "structural_assessment":
      return "A structural check, with an engineer referral if it is needed.";
    case "contamination_assessment":
      return water
        ? "An assessment of how contaminated the water is, which decides what can be kept and what must be removed."
        : "An assessment of the contamination, which decides what can be kept and what must be removed.";
    case "mould_sampling":
      return "A mould assessment, with samples where needed, to set the remediation method.";
    case "moisture_survey":
      return "A moisture survey of walls, floors and ceilings, mapped room by room, so nothing wet is missed.";
    case "progress_monitoring":
      return "Drying checks with readings on each visit, so drying is proven rather than assumed.";
    case "equipment_deployment":
      return fire && !water
        ? null
        : "Equipment set up and recorded unit by unit, with photos.";
    case "completion_verification":
      if (water) {
        return "A completion check: final readings at the drying goal, completion photos, and your sign-off.";
      }
      return fire
        ? "A completion check: residue and odour retested, completion photos, and your sign-off."
        : "A completion check: final test results, completion photos, and your sign-off.";
    default:
      return null;
  }
}

function sectionForStep(stepKey: string): PathwaySection {
  switch (stepKey) {
    case "site_arrival":
    case "hazmat_assessment":
    case "make_safe_actions":
      return "safety";
    case "structural_assessment":
    case "contamination_assessment":
      return "investigate";
    case "scope_of_works":
    case "equipment_deployment":
    case "equipment_setup":
      return "scope";
    default:
      return "evidence";
  }
}

function recToDraft(
  rec: Recommendation,
  n: number,
  whs: (...keys: WhsSourceKey[]) => string[],
): Draft {
  const height =
    rec.category === "safety" && /working at height/i.test(rec.text);
  const section: PathwaySection =
    rec.category === "safety" ||
    rec.category === "habitability" ||
    rec.category === "security"
      ? "safety"
      : rec.category === "documentation"
        ? "evidence"
        : "scope";
  const evidence = height
    ? [ev("PHOTO_EQUIPMENT", 1)]
    : section === "evidence"
      ? [ev("PHOTO_PROGRESS", 1)]
      : [NOTE()];
  const basis = height
    ? whs("falls-cop", "nsw-whs-reg-falls")
    : rec.clause
      ? [rec.clause]
      : [];
  return {
    item: {
      id: height ? "safety.working-at-height" : `rec.${rec.category}.${n}`,
      section,
      severity: rec.severity === "advisory" ? "advisory" : "required",
      action: rec.text,
      why: height
        ? "Falls from ladders and platforms are a leading cause of serious injury. The order of control is: work from the ground or a solid surface where you can, then a fall prevention device, then fall arrest."
        : `Raised by the hazards on this claim (${rec.category.replace("_", " ")}).`,
      basis,
      evidence,
      status: "proposed",
      guidance: {
        apprentice: rec.text,
        experienced: firstSentence(rec.text),
      },
    },
    // Recommendation text is written for technicians; the customer brief
    // carries the engine's own plain-English lines instead.
  };
}

/**
 * Phill's rule (10/11/2026, via the lead thread): RestoreAssist never sets
 * prices. The brief carries this one fixed line and no figures.
 */
export const PRICING_LINE =
  "Your contractor prices this from their own rates, within the NRPG national average range.";

interface BriefInput {
  claimType: JobType;
  facts: ClaimFacts;
  rooms: string[];
  waterCategory: string | null;
  waterClass: number | null;
  standards: StandardKey[];
  state: string | null;
  whsUsed: Set<WhsSourceKey>;
  fire: boolean;
  waterPresent: boolean;
  mould: boolean;
  drafts: Draft[];
}

function buildCustomerBrief(b: BriefInput): CustomerBrief {
  const prop = b.facts.property ?? {};
  const loss = b.facts.loss ?? {};
  const hz = b.facts.hazards ?? {};

  // What happened: only facts that were given.
  const what: string[] = [`${JOB_TYPE_LABELS[b.claimType]} claim.`];
  if (loss.lossDate) what.push(`Date of loss: ${loss.lossDate}.`);
  if (loss.originRoom) {
    what.push(
      `${b.fire ? "Reported fire origin" : "Reported starting point"}: ${loss.originRoom}.`,
    );
  }
  if (
    b.fire &&
    (loss.smokeColour ||
      (loss.smokeResidueHint && loss.smokeResidueHint !== "unknown"))
  ) {
    const described =
      loss.smokeColour ?? RESIDUE_LABEL[loss.smokeResidueHint as string];
    what.push(`Reported smoke: ${described}. Testing on site will confirm it.`);
  }
  if (b.waterPresent) {
    const parts = [
      b.waterCategory ? `Category ${b.waterCategory}` : null,
      b.waterClass ? `Class ${b.waterClass}` : null,
    ].filter(Boolean);
    what.push(
      parts.length
        ? `Water: ${parts.join(", ")}.`
        : "Water is involved; its category and class are still to be confirmed.",
    );
  }
  if (known(hz.mouldCondition) && hz.mouldCondition > 0) {
    what.push(`Mould: ${MOULD_CONDITION_LABEL[hz.mouldCondition]} reported.`);
  }
  if (b.rooms.length)
    what.push(`Affected rooms reported: ${b.rooms.join(", ")}.`);
  const propParts = [
    known(prop.storeys)
      ? `${prop.storeys} storey${prop.storeys === 1 ? "" : "s"}`
      : null,
    known(prop.buildYear) ? `built ${prop.buildYear}` : null,
    prop.furnished === true
      ? "furnished"
      : prop.furnished === false
        ? "unfurnished"
        : null,
  ].filter(Boolean);
  if (propParts.length) what.push(`Property: ${propParts.join(", ")}.`);

  // What the standards expect.
  const stds: string[] = b.standards.map((k) => {
    const adoption = b.state
      ? ` In Australia, ${applicableStandard(k, "AU")} governs.`
      : "";
    return `IICRC ${standardCite(k)}: the industry standard for ${STANDARD_TOPIC[k]}.${adoption}`;
  });
  for (const key of [...b.whsUsed].sort()) {
    stds.push(`Work health and safety: ${whsCustomerLabel(key)}.`);
  }

  const scope = [
    "Every item below is proposed and will be confirmed on site by the technician.",
    ...b.drafts
      .filter((d) => d.customer?.bucket === "properScope")
      .map((d) => d.customer!.line),
    PRICING_LINE,
  ];
  const confirm = b.drafts
    .filter((d) => d.customer?.bucket === "toConfirm")
    .map((d) => d.customer!.line);

  const questions: string[] = [];
  if (b.fire) {
    questions.push(
      "Will each surface type be test-cleaned before anyone says it can't be cleaned?",
      "How will smoke residue be checked in each room after cleaning?",
      "How will odour be measured at the start and at the end?",
    );
    if (prop.furnished === true) {
      questions.push(
        "Where will cleaned belongings be stored while work continues?",
      );
    }
  }
  if (b.waterPresent) {
    questions.push(
      "What category and class has the water been given, and on what evidence?",
      "How will drying be measured, and what are the drying goals?",
    );
  }
  if (b.claimType === "MOULD" || b.mould) {
    questions.push(
      "Where is the moisture source, and has it been fixed?",
      "How will the work area be contained?",
      "Will there be a clearance check after remediation?",
    );
  }
  questions.push(
    "Which items in the scope are still to be confirmed on site, and when will you confirm them?",
  );

  return {
    whatHappened: { heading: "What happened", lines: what },
    standardsExpect: { heading: "What the standards expect", lines: stds },
    properScope: {
      heading: "What a proper scope includes, and why",
      lines: scope,
    },
    toConfirm: { heading: "Still to be confirmed on site", lines: confirm },
    questions: { heading: "Questions to ask", lines: questions },
  };
}
