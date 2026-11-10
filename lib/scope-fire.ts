/**
 * Fire & Smoke Damage Scope Generation Engine
 *
 * Produces deterministic scope items for fire/smoke restoration jobs
 * following IICRC S700:2025, and prices them. This file is the single owner
 * of fire scope pricing (RA-8275).
 *
 * Driving factors:
 *   - smokeType      — cleaning method selection (S700:2025 §4.3)
 *   - charLevel      — structural damage severity (S700:2025 §6.2)
 *   - affectedAreaM2 — building surface area in m², converted once at source
 *   - job            — severity, contents and fixture counts, crew and days
 *   - pricingConfig  — the contractor's OWN price list (CompanyPricingConfig /
 *                      OrganizationPricingConfig), read field by field
 *
 * Pricing rules (RA-8275, founder rule "NRPG Contractors use National Price
 * Averages"):
 *   - RestoreAssist never sets a price. Each line reads one named field from
 *     the contractor's own price list. No hard-coded rate, no default.
 *   - A fire line never reads a mould, antimicrobial or biohazard field.
 *   - The NRPG national range for that field (lib/nrpg-rate-ranges.ts) is
 *     enforced: a value outside it is not used.
 *   - A field the contractor has not set is "rate_not_set"; a line with no
 *     price-list field yet is "needs_price_list_field"; a missing inspection
 *     quantity is "quantity_needed". Each blocks the total. None is $0.
 *   - When crew and days are given, cleaning tasks are carried by labour
 *     hours ("included_in_labour") so the same work is not charged twice.
 *   - GST comes only from lib/gst-rules.ts.
 */

import type { GstTreatment } from "./gst-rules";
import { standardCite } from "./nir-standards-mapping";
import { getFieldRange, type NRPGRateRange } from "./nrpg-rate-ranges";

// ─── TYPES ────────────────────────────────────────────────────────────────────

/** IICRC S700:2025 §4.3 smoke residue classification */
export type SmokeType = "wet" | "dry" | "protein" | "fuel_oil";

/** Contractor-assessed residue severity. Scales protein enzyme passes. */
export type FireSeverity = "light" | "medium" | "heavy";

/**
 * Pricing state of a scope line.
 *   priced                 — quantity known; the contractor's rate is set and
 *                            inside its NRPG national range
 *   rate_not_set           — the contractor has not set this price-list field
 *   rate_out_of_range      — the contractor's value is outside the NRPG range
 *   needs_price_list_field — no price-list field exists for this line yet
 *   quantity_needed        — the inspection has no quantity for this line
 *   included_in_labour     — the task is billed through labour hours
 * Every state except priced and included_in_labour blocks the total.
 */
export type PricingStatus =
  | "priced"
  | "rate_not_set"
  | "rate_out_of_range"
  | "needs_price_list_field"
  | "quantity_needed"
  | "included_in_labour";

export type BlockingStatus = Exclude<
  PricingStatus,
  "priced" | "included_in_labour"
>;

/** Which part of the job a line belongs to. */
export type FireLineGroup =
  "surfaces" | "contents" | "structure" | "labour" | "equipment" | "fees";

export interface ScopeItemDraft {
  itemType: string;
  description: string;
  justification: string;
  /** IICRC S700:2025 clause reference — e.g. "S700:2025 §4.3" */
  iicrcReference: string;
  quantity?: number;
  unit?: string;
  /** Unit cost in AUD, taken from the contractor's own price list */
  unitCostAud?: number;
  isRequired: boolean;
  /** RA-8275: set by generators that report pricing state (fire today). */
  pricingStatus?: PricingStatus;
  /** RA-8275: surfaces vs contents split (fire today). */
  group?: FireLineGroup;
  /** RA-8275: the contractor price-list field this line is priced from. */
  rateField?: string;
  /** RA-8275: proposed field name when no price-list field exists yet. */
  proposedRateField?: string;
  /** RA-8275: plain-English pricing note for blocked lines. */
  pricingNote?: string;
}

/**
 * The contractor's price list: a CompanyPricingConfig or
 * OrganizationPricingConfig row (or any object with the same field names).
 * Read field by field; nothing here supplies a value.
 */
export type FirePricingConfig = object;

/**
 * Job facts beyond the affected surface area. Each is optional; a line
 * whose quantity is missing shows as "quantity needed".
 */
export interface FireJobInputs {
  severity?: FireSeverity;
  /** Contents items to clean (e.g. ContentsPackOutItem rows). */
  contentsItemCount?: number;
  windowCount?: number;
  /** Inside cupboards and bench tops, m². */
  cupboardBenchAreaM2?: number;
  carpetAreaM2?: number;
  /** Sofas, mattresses, curtains and similar, counted per item. */
  softFurnishingCount?: number;
  /** HVAC systems (ducts and exhausts) to clean. */
  hvacSystemCount?: number;
  lightFittingCount?: number;
  technicians?: number;
  supervisors?: number;
  buildingDays?: number;
  contentsDays?: number;
  airScrubbers?: number;
  /** Equipment unit-days on site. */
  hepaVacuumUnitDays?: number;
  ozoneUnitDays?: number;
  hydroxylUnitDays?: number;
}

/** Standard working day used to turn crew days into billable hours. */
export const FIRE_LABOUR_HOURS_PER_DAY = 8;

/** Customer-facing basis line for a fire estimate (founder wording). */
export const FIRE_PRICING_BASIS =
  "Priced from your contractor's own rates, within the NRPG national average range.";

// ─── IICRC S700:2025 CLAUSE REFS ─────────────────────────────────────────────

/** S700:2025 §4.3 — Smoke type classification */
const S700_SMOKE_CLASSIFICATION = standardCite("S700", "4.3");

/** S700:2025 §6.2 — Dry residue cleaning */
const S700_DRY_RESIDUE = standardCite("S700", "6.2");

/** S700:2025 §6.4 — Wet residue cleaning */
const S700_WET_RESIDUE = standardCite("S700", "6.4");

/** S700:2025 §7.1 — Odour control */
const S700_ODOUR_CONTROL = standardCite("S700", "7.1");

/** S700:2025 §6 — Cleaning and decontamination (general) */
const S700_CLEANING = standardCite("S700", "6");

// ─── LINE BUILDING ───────────────────────────────────────────────────────────

/**
 * How a line is priced: from an existing price-list field, or (when none
 * exists) the field name we propose adding. Proposed fields carry no range;
 * range values are a founder decision.
 */
type RateSource = { field: string } | { proposed: string };

function usableQuantity(q: number | undefined): number | undefined {
  return typeof q === "number" && Number.isFinite(q) && q > 0 ? q : undefined;
}

function formatRange(range: NRPGRateRange): string {
  return `national range $${range.min}-$${range.max} ${range.unit.replace(/^\$\//, "per ")}`;
}

/** Read one field from the contractor's price list. Never supplies a value. */
function readRate(
  config: FirePricingConfig,
  field: string,
):
  | { status: "priced"; rate: number }
  | { status: "rate_not_set" | "rate_out_of_range"; note: string } {
  const raw = (config as Record<string, unknown>)[field];
  const range = getFieldRange(field);
  const rangeText = range ? ` (${formatRange(range)})` : "";
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return {
      status: "rate_not_set",
      note: `Rate not set. Set ${field} in your price list${rangeText}.`,
    };
  }
  if (range && (raw < range.min || raw > range.max)) {
    return {
      status: "rate_out_of_range",
      note: `Your ${field} of $${raw} is outside the NRPG ${formatRange(range)}. Update it in your price list.`,
    };
  }
  return { status: "priced", rate: raw };
}

interface LineSpec {
  itemType: string;
  description: string;
  justification: string;
  iicrcReference: string;
  unit: string;
  group: FireLineGroup;
  quantity: number | undefined;
  source: RateSource;
  /** Billed through labour hours when the job is labour-priced. */
  labourTask: boolean;
  /** Fixed-scope line with no quantity (e.g. an assessment). */
  fixed?: boolean;
}

function buildLine(
  spec: LineSpec,
  config: FirePricingConfig,
  labourPriced: boolean,
): ScopeItemDraft {
  const quantity = spec.fixed ? undefined : usableQuantity(spec.quantity);
  const base: ScopeItemDraft = {
    itemType: spec.itemType,
    description: spec.description,
    justification: spec.justification,
    iicrcReference: spec.iicrcReference,
    quantity,
    unit: spec.unit,
    isRequired: true,
    group: spec.group,
    ...("field" in spec.source
      ? { rateField: spec.source.field }
      : { proposedRateField: spec.source.proposed }),
  };
  // A labour-priced task is billed through hours, so its own count is
  // informative only and a missing count does not block the total.
  if (spec.labourTask && labourPriced) {
    return { ...base, pricingStatus: "included_in_labour" };
  }
  if (!spec.fixed && quantity === undefined) {
    return {
      ...base,
      pricingStatus: "quantity_needed",
      pricingNote: "Quantity needed from the inspection.",
    };
  }
  if (!("field" in spec.source)) {
    return {
      ...base,
      pricingStatus: "needs_price_list_field",
      pricingNote: `Needs a price-list field (proposed: ${spec.source.proposed}).`,
    };
  }
  const read = readRate(config, spec.source.field);
  if (read.status !== "priced") {
    return { ...base, pricingStatus: read.status, pricingNote: read.note };
  }
  return { ...base, unitCostAud: read.rate, pricingStatus: "priced" };
}

// ─── SCOPE GENERATION ────────────────────────────────────────────────────────

/**
 * Generate required scope items for a fire/smoke restoration job.
 *
 * Smoke type drives cleaning method selection per IICRC S700:2025 §4.3.
 * Charring level ≥ 3 triggers structural assessment per S700:2025 §6.2.
 *
 * `affectedAreaM2` must already be m². Callers holding sq ft convert once
 * with `resolveAreaSqm` from lib/units.ts before calling.
 */
export function generateFireScope(params: {
  smokeType: SmokeType;
  charLevel: 1 | 2 | 3 | 4;
  affectedAreaM2: number;
  pricingConfig: FirePricingConfig;
  job?: FireJobInputs;
}): ScopeItemDraft[] {
  const { smokeType, charLevel, affectedAreaM2, pricingConfig } = params;
  const job = params.job ?? {};
  const labourDays = (job.buildingDays ?? 0) + (job.contentsDays ?? 0);
  const crew = (job.technicians ?? 0) + (job.supervisors ?? 0);
  const labourPriced = labourDays > 0 && crew > 0;
  const specs: LineSpec[] = [];

  /** Surface line scaled by the affected area (m²). */
  const surface = (
    s: Omit<LineSpec, "unit" | "group" | "quantity" | "labourTask">,
  ): LineSpec => ({
    ...s,
    unit: "m²",
    group: "surfaces",
    quantity: affectedAreaM2,
    labourTask: true,
  });

  /**
   * The primary residue clean for the smoke type, priced once per m² from
   * the contractor's fire restoration rate.
   */
  const primaryClean = (
    s: Pick<
      LineSpec,
      "itemType" | "description" | "justification" | "iicrcReference"
    >,
  ): LineSpec => surface({ ...s, source: { field: "rateFireRestoration" } });

  /** Equipment hired by the day. */
  const equipmentDays = (
    s: Pick<
      LineSpec,
      "itemType" | "description" | "justification" | "iicrcReference"
    >,
    field: string,
    unitDays: number | undefined,
  ): LineSpec => ({
    ...s,
    unit: "unit-day",
    group: "equipment",
    quantity: unitDays,
    source: { field },
    labourTask: false,
  });

  const hepaVacuum = (justification: string, iicrcReference: string) =>
    equipmentDays(
      {
        itemType: "hepa_vacuum",
        description: "HEPA Vacuum",
        justification,
        iicrcReference,
      },
      "hepaVacuumDailyRate",
      job.hepaVacuumUnitDays,
    );

  const ozone = (justification: string) =>
    equipmentDays(
      {
        itemType: "ozone_treatment",
        description: "Ozone Treatment",
        justification,
        iicrcReference: S700_ODOUR_CONTROL,
      },
      "rateOzoneGenerator",
      job.ozoneUnitDays,
    );

  // ── Smoke-type-specific cleaning items ────────────────────────────────────

  switch (smokeType) {
    case "wet": {
      // S700:2025 §6.4 — Wet residue: degreaser + HEPA vacuum + ozone
      specs.push(
        primaryClean({
          itemType: "degreaser_clean",
          description: "Degreaser Clean",
          justification:
            "Wet smoke deposits oily residue requiring degreaser application to emulsify and lift deposits per IICRC S700:2025 §6.4.",
          iicrcReference: S700_WET_RESIDUE,
        }),
        hepaVacuum(
          "HEPA vacuuming removes loose wet smoke particles after degreaser application per IICRC S700:2025 §6.4.",
          S700_WET_RESIDUE,
        ),
        ozone(
          "Ozone treatment neutralises wet smoke odour compounds at the molecular level per IICRC S700:2025 §7.1.",
        ),
      );
      break;
    }

    case "dry": {
      // S700:2025 §6.2 — Dry residue: dry sponge + HEPA vacuum + hydroxyl
      specs.push(
        primaryClean({
          itemType: "dry_sponge_wipe",
          description: "Dry Sponge Wipe",
          justification:
            "Dry smoke residue must be removed with dry chemical sponges before any wet cleaning to prevent smearing per IICRC S700:2025 §6.2.",
          iicrcReference: S700_DRY_RESIDUE,
        }),
        hepaVacuum(
          "HEPA vacuuming captures residual dry soot particles after dry sponge cleaning per IICRC S700:2025 §6.2.",
          S700_DRY_RESIDUE,
        ),
        equipmentDays(
          {
            itemType: "hydroxyl_treatment",
            description: "Hydroxyl Treatment",
            justification:
              "Hydroxyl generation eliminates dry smoke odours without requiring site evacuation per IICRC S700:2025 §7.1.",
            iicrcReference: S700_ODOUR_CONTROL,
          },
          "rateHydroxylUnit",
          job.hydroxylUnitDays,
        ),
      );
      break;
    }

    case "protein": {
      // S700:2025 §4.3 — Protein residue: enzyme passes scaled to severity,
      // then ozone + deodorisation. Light residue takes one enzyme pass;
      // medium and heavy take two (the previous fixed default); heavy adds
      // a HEPA vacuum. Severity not given → two passes.
      const severity = job.severity ?? "medium";
      specs.push(
        primaryClean({
          itemType: "enzyme_treatment_1",
          description: "Enzyme Treatment (Pass 1)",
          justification:
            "Protein smoke residue requires enzymatic treatment to break down organic compounds per IICRC S700:2025 §4.3.",
          iicrcReference: S700_SMOKE_CLASSIFICATION,
        }),
      );
      if (severity !== "light") {
        specs.push(
          surface({
            itemType: "enzyme_treatment_2",
            description: "Enzyme Treatment (Pass 2)",
            justification: `Second enzyme pass for ${severity} protein residue, for complete breakdown before odour control per IICRC S700:2025 §4.3.`,
            iicrcReference: S700_SMOKE_CLASSIFICATION,
            source: { proposed: "rateFireEnzymeAdditionalPass" },
          }),
        );
      }
      if (severity === "heavy") {
        specs.push(
          hepaVacuum(
            "Heavy protein residue: HEPA vacuuming captures loosened residue and particulate after enzymatic cleaning per IICRC S700:2025 §6.",
            S700_CLEANING,
          ),
        );
      }
      specs.push(
        ozone(
          "Ozone treatment neutralises persistent protein smoke odour compounds after enzymatic cleaning per IICRC S700:2025 §7.1.",
        ),
        surface({
          itemType: "deodorisation",
          description: "Deodorisation Treatment",
          justification:
            "Deodorisation eliminates residual protein odours following enzyme and ozone treatments per IICRC S700:2025 §7.1.",
          iicrcReference: S700_ODOUR_CONTROL,
          source: { proposed: "rateFireDeodorisation" },
        }),
      );
      break;
    }

    case "fuel_oil": {
      // S700:2025 §6.2 — Fuel oil soot: chemical sponge + solvent + ozone
      specs.push(
        primaryClean({
          itemType: "chemical_sponge_clean",
          description: "Chemical Sponge Clean",
          justification:
            "Fuel oil soot is removed with dry chemical sponges first to prevent petroleum residue from spreading during wet cleaning per IICRC S700:2025 §6.2.",
          iicrcReference: S700_DRY_RESIDUE,
        }),
        surface({
          itemType: "solvent_clean",
          description: "Solvent Clean",
          justification:
            "Solvent cleaning dissolves petroleum-based fuel oil soot deposits that cannot be removed by water-based methods per IICRC S700:2025 §6.2.",
          iicrcReference: S700_DRY_RESIDUE,
          source: { proposed: "rateFireSolventClean" },
        }),
        ozone(
          "Ozone treatment neutralises fuel oil odour compounds at the molecular level per IICRC S700:2025 §7.1.",
        ),
      );
      break;
    }
  }

  // ── Job lines every smoke clean needs (RA-8275) ───────────────────────────

  const counted = (
    s: Omit<LineSpec, "labourTask" | "source"> & {
      proposed?: string;
      field?: string;
    },
  ): LineSpec => {
    const { proposed, field, ...rest } = s;
    return {
      ...rest,
      source: field ? { field } : { proposed: proposed as string },
      labourTask: true,
    };
  };

  specs.push(
    surface({
      itemType: "wall_ceiling_wash",
      description: "Wall and Ceiling Wash",
      justification:
        "Smoke residue settles on walls and ceilings; affected surfaces are washed after residue-specific cleaning per IICRC S700:2025 §6.",
      iicrcReference: S700_CLEANING,
      source: { proposed: "rateFireWallCeilingWash" },
    }),
    counted({
      itemType: "window_track_clean",
      description: "Windows and Tracks Clean",
      justification:
        "Glass, frames and tracks collect smoke residue and are cleaned per IICRC S700:2025 §6.",
      iicrcReference: S700_CLEANING,
      unit: "window",
      group: "surfaces",
      quantity: job.windowCount,
      proposed: "rateFireWindowTrackClean",
    }),
    counted({
      itemType: "cupboard_bench_clean",
      description: "Inside Cupboards and Benches Clean",
      justification:
        "Smoke enters enclosed joinery; cupboard interiors and bench tops are cleaned per IICRC S700:2025 §6.",
      iicrcReference: S700_CLEANING,
      unit: "m²",
      group: "surfaces",
      quantity: job.cupboardBenchAreaM2,
      proposed: "rateFireCupboardBenchClean",
    }),
    counted({
      itemType: "light_fitting_clean",
      description: "Light Fittings Clean",
      justification:
        "Light fittings and diffusers hold smoke residue and are removed or cleaned in place per IICRC S700:2025 §6.",
      iicrcReference: S700_CLEANING,
      unit: "fitting",
      group: "surfaces",
      quantity: job.lightFittingCount,
      proposed: "rateLightFittingClean",
    }),
    counted({
      itemType: "hvac_duct_clean",
      description: "HVAC and Exhaust Duct Clean",
      justification:
        "HVAC and exhaust ducts distribute smoke residue and odour through the building and are cleaned per IICRC S700:2025 §6.",
      iicrcReference: S700_CLEANING,
      unit: "system",
      group: "surfaces",
      quantity: job.hvacSystemCount,
      proposed: "rateHvacDuctClean",
    }),
    counted({
      itemType: "carpet_clean",
      description: "Carpet Clean",
      justification:
        "Carpet holds smoke residue and odour and is hot-water extracted or replaced per IICRC S700:2025 §6.",
      iicrcReference: S700_CLEANING,
      unit: "m²",
      group: "surfaces",
      quantity: job.carpetAreaM2,
      proposed: "rateCarpetClean",
    }),
    counted({
      itemType: "contents_clean",
      description: "Contents Cleaning or Pack-out",
      justification:
        "Household contents are cleaned on site or packed out for cleaning, counted per item separately from building surfaces per IICRC S700:2025 §6.",
      iicrcReference: S700_CLEANING,
      unit: "item",
      group: "contents",
      quantity: job.contentsItemCount,
      field: "rateContentsClean",
    }),
    counted({
      itemType: "soft_furnishing_clean",
      description: "Soft Furnishings Clean",
      justification:
        "Upholstery, mattresses and curtains absorb smoke odour and are cleaned per item per IICRC S700:2025 §6.",
      iicrcReference: S700_CLEANING,
      unit: "item",
      group: "contents",
      quantity: job.softFurnishingCount,
      proposed: "rateSoftFurnishingClean",
    }),
  );

  // ── Charring level ≥ 3: structural assessment + debris removal ─────────────

  if (charLevel >= 3) {
    specs.push(
      {
        itemType: "structural_assessment",
        description: "Structural Assessment",
        justification: `Charring level ${charLevel} indicates deep structural charring; a formal structural assessment is required before restoration proceeds per IICRC S700:2025 §6.2.`,
        iicrcReference: S700_DRY_RESIDUE,
        unit: "ea",
        group: "structure",
        quantity: undefined,
        source: { proposed: "rateStructuralAssessment" },
        labourTask: false,
        fixed: true,
      },
      {
        itemType: "debris_removal",
        description: "Debris Removal",
        justification: `Charring level ${charLevel} produces structural debris that must be removed before surface cleaning and restoration per IICRC S700:2025 §6.2.`,
        iicrcReference: S700_DRY_RESIDUE,
        unit: "m²",
        group: "structure",
        quantity: affectedAreaM2,
        source: { proposed: "rateFireDebrisRemoval" },
        labourTask: false,
      },
    );
  }

  // ── Labour, equipment and fees ─────────────────────────────────────────────

  if (labourPriced) {
    const hoursPerHead = labourDays * FIRE_LABOUR_HOURS_PER_DAY;
    const daysNote = `${job.buildingDays ?? 0} building day(s) and ${job.contentsDays ?? 0} contents day(s) at ${FIRE_LABOUR_HOURS_PER_DAY} hours`;
    specs.push(
      {
        itemType: "labour_technician_hours",
        description: "Technician Labour",
        justification: `${job.technicians ?? 0} technician(s) for ${daysNote}. Cleaning tasks above are carried by these hours.`,
        iicrcReference: S700_CLEANING,
        unit: "hr",
        group: "labour",
        quantity: (job.technicians ?? 0) * hoursPerHead,
        source: { field: "qualifiedTechnicianNormalHours" },
        labourTask: false,
      },
      {
        itemType: "labour_supervisor_hours",
        description: "Supervisor Labour",
        justification: `${job.supervisors ?? 0} supervisor(s) for ${daysNote}.`,
        iicrcReference: S700_CLEANING,
        unit: "hr",
        group: "labour",
        quantity: (job.supervisors ?? 0) * hoursPerHead,
        source: { field: "masterQualifiedNormalHours" },
        labourTask: false,
      },
    );
  }
  // Without crew and days the job is area-priced: each cleaning line's own
  // price-list rate carries its labour, so no separate labour line is added.

  if (job.airScrubbers !== undefined) {
    specs.push({
      itemType: "air_scrubber_hire",
      description: "Air Scrubber Hire",
      justification:
        "HEPA air scrubbers capture airborne smoke particulate while cleaning is under way per IICRC S700:2025 §6.",
      iicrcReference: S700_CLEANING,
      unit: "unit-day",
      group: "equipment",
      quantity: labourDays > 0 ? job.airScrubbers * labourDays : undefined,
      source: { field: "afdUnitLargeDailyRate" },
      labourTask: false,
    });
  }

  specs.push(
    {
      itemType: "call_out_fee",
      description: "Call-out Fee",
      justification: "Attendance and mobilisation to site.",
      iicrcReference: S700_CLEANING,
      unit: "ea",
      group: "fees",
      quantity: 1,
      source: { field: "callOutFee" },
      labourTask: false,
    },
    {
      itemType: "administration_fee",
      description: "Administration Fee",
      justification: "Job administration, documentation and claim reporting.",
      iicrcReference: S700_CLEANING,
      unit: "ea",
      group: "fees",
      quantity: 1,
      source: { field: "administrationFee" },
      labourTask: false,
    },
  );

  return specs.map((s) => buildLine(s, pricingConfig, labourPriced));
}

// ─── PRICING ─────────────────────────────────────────────────────────────────

export interface FirePricedLine {
  itemType: string;
  description: string;
  group?: FireLineGroup;
  unit?: string;
  quantity: number | null;
  rate: number | null;
  lineTotalExGst: number | null;
  gstAmount: number | null;
  lineTotalIncGst: number | null;
  pricingStatus: PricingStatus;
  rateField?: string;
  proposedRateField?: string;
  pricingNote?: string;
}

export interface FireMissingItem {
  itemType: string;
  description: string;
  reason: BlockingStatus;
  note: string;
}

export type FirePricedScope = {
  lines: FirePricedLine[];
  missing: FireMissingItem[];
  gstRate: number;
  currency: string;
  basis: string;
} & (
  | {
      status: "complete";
      subtotalExGst: number;
      gstTotal: number;
      totalIncGst: number;
    }
  | {
      status: "blocked";
      subtotalExGst: null;
      gstTotal: null;
      totalIncGst: null;
    }
);

function statusOf(item: ScopeItemDraft): PricingStatus {
  if (item.pricingStatus) return item.pricingStatus;
  return typeof item.unitCostAud === "number" && item.unitCostAud > 0
    ? "priced"
    : "rate_not_set";
}

/**
 * Price a fire scope. Any line that is not priced (and not carried by
 * labour) blocks the total: the totals are null, never a partial sum and
 * never $0.
 */
export function priceFireScope(
  items: ScopeItemDraft[],
  gst: GstTreatment,
): FirePricedScope {
  const missing: FireMissingItem[] = [];
  const lines: FirePricedLine[] = items.map((item) => {
    const pricingStatus = statusOf(item);
    const base = {
      itemType: item.itemType,
      description: item.description,
      group: item.group,
      unit: item.unit,
      quantity: item.quantity ?? null,
      pricingStatus,
      rateField: item.rateField,
      proposedRateField: item.proposedRateField,
      pricingNote: item.pricingNote,
    };
    if (pricingStatus !== "priced") {
      if (pricingStatus !== "included_in_labour") {
        missing.push({
          itemType: item.itemType,
          description: item.description,
          reason: pricingStatus,
          note: item.pricingNote ?? "Rate not set.",
        });
      }
      return {
        ...base,
        rate: null,
        lineTotalExGst: null,
        gstAmount: null,
        lineTotalIncGst: null,
      };
    }
    const rate = item.unitCostAud as number;
    const quantity = item.quantity ?? 1;
    const lineTotalExGst = +(quantity * rate).toFixed(2);
    const gstAmount = +(lineTotalExGst * gst.rate).toFixed(2);
    return {
      ...base,
      quantity,
      rate,
      lineTotalExGst,
      gstAmount,
      lineTotalIncGst: +(lineTotalExGst + gstAmount).toFixed(2),
    };
  });

  const common = {
    lines,
    missing,
    gstRate: gst.rate,
    currency: gst.currency,
    basis: FIRE_PRICING_BASIS,
  };
  if (missing.length > 0) {
    return {
      ...common,
      status: "blocked",
      subtotalExGst: null,
      gstTotal: null,
      totalIncGst: null,
    };
  }
  const subtotalExGst = +lines
    .reduce((s, l) => s + (l.lineTotalExGst ?? 0), 0)
    .toFixed(2);
  const gstTotal = +lines
    .reduce((s, l) => s + (l.gstAmount ?? 0), 0)
    .toFixed(2);
  return {
    ...common,
    status: "complete",
    subtotalExGst,
    gstTotal,
    totalIncGst: +(subtotalExGst + gstTotal).toFixed(2),
  };
}
