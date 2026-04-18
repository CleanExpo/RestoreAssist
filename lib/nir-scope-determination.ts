/**
 * NIR Automatic Scope Determination Engine
 *
 * Determines required scope items based on:
 *   - IICRC classification (Category & Class)
 *   - Building code requirements
 *   - Affected areas and surface types
 *   - Water source contamination level
 *
 * Changes from v1:
 *   - Area units corrected: sq ft → m² (Australian metric standard)
 *   - Environmental field names in ScopeDeterminationInput kept as ambientTemperature /
 *     humidityLevel — these mirror the Prisma column names in the EnvironmentalData model
 *     so the submit route can pass inspection.environmentalData directly without mapping.
 *     The report route maps these to ambientTemperatureCelsius / humidityPercent when
 *     constructing NirReportInspectionData (see nir-report-generation.ts).
 *   - standardReference strings replaced with typed clauseRefs[] from nir-standards-mapping
 *   - ScopeItem.clauseRefs[] added for standards traceability through to PDF/Excel
 *   - American spelling corrected: mold_testing → mould_testing
 *   - Implicit any removed from area calculations
 */

import { BuildingCodeRequirements } from "./nir-building-codes";
import { S500_FIELD_MAP } from "./nir-standards-mapping";

// ─── OUTPUT TYPES ─────────────────────────────────────────────────────────────

export interface ScopeItem {
  itemType: string;
  description: string;
  justification: string;
  /** @deprecated Use clauseRefs[] for new code. Kept for backward compatibility. */
  standardReference: string;
  /** Typed IICRC clause references — used by PDF generator and verification checklist */
  clauseRefs?: string[];
  quantity?: number;
  /** Area-based items use m² (Australian metric standard) */
  unit?: string;
  specification?: string;
  isRequired: boolean;
  /** GST/tax treatment — INPUT = subcontractor pass-through, OUTPUT = taxable supply */
  taxType?: "OUTPUT" | "INPUT" | "EXEMPT" | "NONE";
}

// ─── INPUT TYPES ──────────────────────────────────────────────────────────────

export interface ScopeDeterminationInput {
  category: string;
  class: string;
  waterSource: string;
  affectedAreas: Array<{
    roomZoneId: string;
    /** Area in m² — Australian metric standard */
    affectedSquareFootage: number;
    surfaceType?: string;
    moistureLevel?: number;
  }>;
  buildingCodeRequirements?: BuildingCodeRequirements;
  buildingCodeTriggers?: {
    triggered: boolean;
    triggers: string[];
    requiredActions: string[];
  };
  /**
   * Environmental conditions — field names mirror the Prisma EnvironmentalData model
   * so the submit route can pass inspection.environmentalData without transformation.
   * Both values should be recorded in metric: °C and % respectively.
   */
  environmentalData?: {
    /** Stored as Prisma column ambientTemperature — interpret as °C (S500 §12.4) */
    ambientTemperature: number;
    /** Stored as Prisma column humidityLevel — percentage 0–100 */
    humidityLevel: number;
  };
}

// ─── CLAUSE REF HELPERS ───────────────────────────────────────────────────────

/** Contamination control and antimicrobial treatment (Category 2/3) */
const CONTAMINATION_CLAUSE = S500_FIELD_MAP.waterCategory.clauseRef; // e.g. "IICRC S500 §7.1"

/** Drying equipment (dehumidification + air movers, Class 2+) */
const DRYING_EQUIPMENT_CLAUSE = S500_FIELD_MAP.dryingEquipment.clauseRef;

/** Water extraction — S500 §6 */
const EXTRACTION_CLAUSE = "IICRC S500 §6";

/** Structural drying — S500 §5 */
const STRUCTURAL_DRYING_CLAUSE = "IICRC S500 §5";

/** Drywall demolition / building code — S500 §6 */
const DRYWALL_CLAUSE = "IICRC S500 §6";

// ─── SCOPE DETERMINATION ──────────────────────────────────────────────────────

/**
 * Determine required scope items automatically from IICRC classification inputs.
 *
 * All area quantities are in m² (Australian metric standard).
 * All clauseRefs[] entries are typed from nir-standards-mapping.ts.
 */
export function determineScopeItems(
  input: ScopeDeterminationInput,
): ScopeItem[] {
  const scopeItems: ScopeItem[] = [];

  // Total affected area in m²
  const totalAffectedArea = input.affectedAreas.reduce(
    (sum, area) => sum + area.affectedSquareFootage,
    0,
  );

  // ── Category 2/3: contamination control ────────────────────────────────────

  if (input.category === "2" || input.category === "3") {
    scopeItems.push({
      itemType: "containment_setup",
      description: "Containment Setup",
      justification: `Category ${input.category} water requires containment to prevent cross-contamination per IICRC S500.`,
      standardReference: CONTAMINATION_CLAUSE,
      clauseRefs: [CONTAMINATION_CLAUSE, "IICRC S500 §4.3"],
      isRequired: true,
    });

    scopeItems.push({
      itemType: "ppe_required",
      description: "Personal Protective Equipment (PPE)",
      justification: `Category ${input.category} water requires appropriate PPE for worker safety.`,
      standardReference: CONTAMINATION_CLAUSE,
      clauseRefs: [CONTAMINATION_CLAUSE, "WHS Regulations 2011"],
      isRequired: true,
    });

    scopeItems.push({
      itemType: "apply_antimicrobial",
      description: "Apply Antimicrobial Treatment",
      justification: `Category ${input.category} water requires antimicrobial treatment to prevent microbial growth.`,
      standardReference: CONTAMINATION_CLAUSE,
      clauseRefs: [CONTAMINATION_CLAUSE],
      isRequired: true,
      quantity: totalAffectedArea,
      unit: "m²",
    });
  }

  // ── Class 2/3/4: drying equipment ──────────────────────────────────────────

  if (input.class === "2" || input.class === "3" || input.class === "4") {
    scopeItems.push({
      itemType: "install_dehumidification",
      description: "Install Dehumidification Equipment",
      justification: `Class ${input.class} requires dehumidification equipment per IICRC S500.`,
      standardReference: DRYING_EQUIPMENT_CLAUSE,
      clauseRefs: [DRYING_EQUIPMENT_CLAUSE],
      isRequired: true,
    });

    scopeItems.push({
      itemType: "install_air_movers",
      description: "Install Air Movers",
      justification: `Class ${input.class} requires air movement equipment for effective drying.`,
      standardReference: DRYING_EQUIPMENT_CLAUSE,
      clauseRefs: [DRYING_EQUIPMENT_CLAUSE],
      isRequired: true,
    });
  }

  // ── Extract standing water (always required) ────────────────────────────────

  scopeItems.push({
    itemType: "extract_standing_water",
    description: "Extract Standing Water",
    justification:
      "Standing water must be extracted to begin drying process per IICRC S500.",
    standardReference: EXTRACTION_CLAUSE,
    clauseRefs: [EXTRACTION_CLAUSE],
    isRequired: true,
  });

  // ── Drywall: demolish if high moisture or Cat 2/3 ──────────────────────────

  const hasDrywall = input.affectedAreas.some(
    (area) =>
      area.surfaceType?.toLowerCase().includes("drywall") ||
      area.surfaceType?.toLowerCase().includes("gyprock") ||
      area.surfaceType?.toLowerCase().includes("plaster"),
  );

  if (hasDrywall) {
    const drywallAreas = input.affectedAreas.filter(
      (area) =>
        area.surfaceType?.toLowerCase().includes("drywall") ||
        area.surfaceType?.toLowerCase().includes("gyprock") ||
        area.surfaceType?.toLowerCase().includes("plaster"),
    );

    const highMoistureDrywall = drywallAreas.some(
      (area) => (area.moistureLevel ?? 0) > 20,
    );

    if (
      highMoistureDrywall ||
      input.category === "2" ||
      input.category === "3"
    ) {
      scopeItems.push({
        itemType: "demolish_drywall",
        description: "Demolish Affected Drywall",
        justification:
          "Drywall with moisture > 20% or Category 2/3 contamination requires removal per IICRC S500 and NCC 2022.",
        standardReference: DRYWALL_CLAUSE,
        clauseRefs: [DRYWALL_CLAUSE, "NCC 2022"],
        isRequired: true,
        quantity: drywallAreas.reduce(
          (sum, area) => sum + area.affectedSquareFootage,
          0,
        ),
        unit: "m²",
        specification: "Remove to 300 mm above highest moisture reading",
      });
    }
  }

  // ── Carpet removal (Cat 2/3 or high moisture) ──────────────────────────────

  const hasCarpet = input.affectedAreas.some((area) =>
    area.surfaceType?.toLowerCase().includes("carpet"),
  );

  if (hasCarpet) {
    const carpetAreas = input.affectedAreas.filter((area) =>
      area.surfaceType?.toLowerCase().includes("carpet"),
    );

    if (
      input.category === "2" ||
      input.category === "3" ||
      carpetAreas.some((area) => (area.moistureLevel ?? 0) > 15)
    ) {
      scopeItems.push({
        itemType: "remove_carpet",
        description: "Remove Affected Carpet",
        justification:
          "Carpet affected by Category 2/3 water or high moisture requires removal per IICRC S500.",
        standardReference: EXTRACTION_CLAUSE,
        clauseRefs: [EXTRACTION_CLAUSE],
        isRequired: true,
        quantity: carpetAreas.reduce(
          (sum, area) => sum + area.affectedSquareFootage,
          0,
        ),
        unit: "m²",
      });
    }
  }

  // ── Building code triggered items ──────────────────────────────────────────

  if (input.buildingCodeTriggers?.triggered) {
    const actions = input.buildingCodeTriggers.requiredActions;
    const codeRef = input.buildingCodeRequirements?.codeVersion ?? "NCC 2022";

    if (actions.some((a) => a.toLowerCase().includes("dehumidification"))) {
      if (
        !scopeItems.some((item) => item.itemType === "install_dehumidification")
      ) {
        scopeItems.push({
          itemType: "install_dehumidification",
          description:
            "Install Dehumidification Equipment (Building Code Requirement)",
          justification: `Building code requires dehumidification: ${input.buildingCodeRequirements?.requirements.dehumidificationRequired ?? "Mandatory"}`,
          standardReference: codeRef,
          clauseRefs: [codeRef],
          isRequired: true,
        });
      }
    }

    // Australian English: mould_testing (not mold_testing)
    if (
      actions.some(
        (a) =>
          a.toLowerCase().includes("mold testing") ||
          a.toLowerCase().includes("mould testing"),
      )
    ) {
      scopeItems.push({
        itemType: "mould_testing",
        description: "Mould Testing (Building Code Requirement)",
        justification:
          "Building code requires mould testing due to extended water exposure.",
        standardReference: codeRef,
        clauseRefs: [codeRef, "IICRC S520 §3"],
        isRequired: true,
      });
    }

    if (actions.some((a) => a.toLowerCase().includes("asbestos"))) {
      scopeItems.push({
        itemType: "asbestos_assessment",
        description: "Asbestos Assessment (Building Code Requirement)",
        justification:
          "Building code requires asbestos assessment for pre-1990 buildings.",
        standardReference: codeRef,
        clauseRefs: [codeRef, "WHS Regulations 2011"],
        isRequired: true,
      });
    }

    if (actions.some((a) => a.toLowerCase().includes("lead"))) {
      scopeItems.push({
        itemType: "lead_assessment",
        description: "Lead Paint Assessment (Building Code Requirement)",
        justification:
          "Building code requires lead paint assessment for pre-1970 buildings.",
        standardReference: codeRef,
        clauseRefs: [codeRef, "WHS Regulations 2011"],
        isRequired: true,
      });
    }
  }

  // ── Category 2/3: sanitise (Australian spelling) ───────────────────────────

  if (input.category === "2" || input.category === "3") {
    scopeItems.push({
      itemType: "sanitize_materials",
      description: "Sanitise Affected Materials",
      justification: `Category ${input.category} water requires sanitisation of affected materials.`,
      standardReference: CONTAMINATION_CLAUSE,
      clauseRefs: [CONTAMINATION_CLAUSE],
      isRequired: true,
      quantity: totalAffectedArea,
      unit: "m²",
    });
  }

  // ── Structural drying (always required) ────────────────────────────────────

  scopeItems.push({
    itemType: "dry_out_structure",
    description: "Dry Out Structure",
    justification:
      "Structural drying required per IICRC S500 to restore materials to pre-loss condition.",
    standardReference: STRUCTURAL_DRYING_CLAUSE,
    clauseRefs: [STRUCTURAL_DRYING_CLAUSE],
    isRequired: true,
  });

  return scopeItems;
}

// ─── MOULD SCOPE (S520) ───────────────────────────────────────────────────────

/** IICRC S520 mould severity classification */
export type MouldSeverity = "class1" | "class2" | "class3";

export interface MouldScopeInput {
  /** Total mould-affected area in m² */
  mouldAffectedArea: number;
  /**
   * S520:2015 severity class:
   *   class1 — light surface mould
   *   class2 — penetrating mould (into substrate)
   *   class3 — widespread mould (extensive penetration)
   */
  mouldSeverity: MouldSeverity;
  /** True when porous mould-affected materials (drywall, insulation) require physical removal */
  materialsToRemove: boolean;
  /** True when the moisture source remains active — triggers structural drying (S500:2025 §7.1) */
  moistureSourceActive: boolean;
}

/**
 * S520:2015 deterministic scope engine for mould remediation jobs.
 *
 * Returns items in IICRC S520 sequence:
 *   1. Containment  (§7.3–§7.5)
 *   2. Remediation  (§8.2–§8.3, §9.1 or §9.3, and S500:2025 §7.1 when moisture active)
 *   3. Air Treatment (§8.4, §12.1)
 *   4. Waste        (§11.2) — only when materialsToRemove is true
 *
 * Decontamination chamber (§7.5) is added for Class 2/3 only.
 * Encapsulation (§9.3) replaces material removal when materialsToRemove is false and severity ≥ class2.
 * Clearance test (§12.1) carries taxType: "INPUT" — it is a subcontractor pass-through.
 */
export function determineMouldScopeItems(input: MouldScopeInput): ScopeItem[] {
  const {
    mouldAffectedArea,
    mouldSeverity,
    materialsToRemove,
    moistureSourceActive,
  } = input;
  const items: ScopeItem[] = [];

  // ── 1. Containment ─────────────────────────────────────────────────────────

  items.push({
    itemType: "containment_barrier",
    description: "Containment barrier erection (polyethylene sheeting)",
    justification:
      "Physical containment required before mould remediation commences to prevent spore migration.",
    standardReference: "IICRC S520:2015 §7.3",
    clauseRefs: ["IICRC S520:2015 §7.3"],
    isRequired: true,
    quantity: mouldAffectedArea,
    unit: "m²",
  });

  items.push({
    itemType: "negative_air_pressure",
    description: "Negative air pressure establishment",
    justification:
      "Negative pressure prevents mould spore migration to clean areas during remediation.",
    standardReference: "IICRC S520:2015 §7.4",
    clauseRefs: ["IICRC S520:2015 §7.4"],
    isRequired: true,
  });

  // Decontamination chamber required for penetrating and widespread mould (Class 2/3)
  if (mouldSeverity === "class2" || mouldSeverity === "class3") {
    items.push({
      itemType: "decontamination_chamber",
      description: "Decontamination chamber setup",
      justification:
        "Decontamination chamber required for Class 2/3 mould to prevent cross-contamination on exit.",
      standardReference: "IICRC S520:2015 §7.5",
      clauseRefs: ["IICRC S520:2015 §7.5"],
      isRequired: true,
    });
  }

  // ── 2. Remediation ─────────────────────────────────────────────────────────

  items.push({
    itemType: "hepa_vacuum_surfaces",
    description: "HEPA vacuuming of mould-affected surfaces",
    justification:
      "HEPA vacuuming removes bulk mould contamination from surfaces before wet cleaning.",
    standardReference: "IICRC S520:2015 §8.2",
    clauseRefs: ["IICRC S520:2015 §8.2"],
    isRequired: true,
    quantity: mouldAffectedArea,
    unit: "m²",
  });

  items.push({
    itemType: "damp_wipe_antimicrobial",
    description: "Damp wipe with antimicrobial solution",
    justification:
      "Antimicrobial damp wipe eliminates residual mould contamination after HEPA vacuuming.",
    standardReference: "IICRC S520:2015 §8.3",
    clauseRefs: ["IICRC S520:2015 §8.3"],
    isRequired: true,
    quantity: mouldAffectedArea,
    unit: "m²",
  });

  if (moistureSourceActive) {
    items.push({
      itemType: "structural_drying_mould",
      description: "Structural drying (moisture source unresolved)",
      justification:
        "Active moisture source requires structural drying to prevent mould recurrence.",
      standardReference: "IICRC S500:2025 §7.1",
      clauseRefs: ["IICRC S500:2025 §7.1"],
      isRequired: true,
    });
  }

  if (materialsToRemove) {
    items.push({
      itemType: "mould_material_removal",
      description: "Mould-affected material removal (drywall, insulation)",
      justification:
        "Porous materials with embedded mould require physical removal as surface cleaning is insufficient.",
      standardReference: "IICRC S520:2015 §9.1",
      clauseRefs: ["IICRC S520:2015 §9.1"],
      isRequired: true,
      quantity: mouldAffectedArea,
      unit: "m²",
    });
  } else if (mouldSeverity === "class2" || mouldSeverity === "class3") {
    // Encapsulation when full removal is not practical
    items.push({
      itemType: "encapsulation",
      description: "Encapsulation (full removal not practical)",
      justification:
        "Encapsulation applied to Class 2/3 mould-affected surfaces where full material removal is not practical.",
      standardReference: "IICRC S520:2015 §9.3",
      clauseRefs: ["IICRC S520:2015 §9.3"],
      isRequired: false,
      quantity: mouldAffectedArea,
      unit: "m²",
    });
  }

  // ── 3. Air Treatment ───────────────────────────────────────────────────────

  items.push({
    itemType: "hepa_air_filtration",
    description: "HEPA air filtration during work",
    justification:
      "HEPA air filtration captures airborne mould spores throughout the remediation process.",
    standardReference: "IICRC S520:2015 §8.4",
    clauseRefs: ["IICRC S520:2015 §8.4"],
    isRequired: true,
  });

  // Clearance test is a subcontractor pass-through — taxType INPUT
  items.push({
    itemType: "clearance_air_test",
    description: "Post-remediation clearance test (subcontractor)",
    justification:
      "Independent clearance test required to verify remediation meets S520 acceptance criteria.",
    standardReference: "IICRC S520:2015 §12.1",
    clauseRefs: ["IICRC S520:2015 §12.1"],
    isRequired: true,
    taxType: "INPUT",
  });

  // ── 4. Waste ───────────────────────────────────────────────────────────────

  if (materialsToRemove) {
    items.push({
      itemType: "mould_waste_disposal",
      description: "Bagged mould-contaminated material disposal",
      justification:
        "Contaminated materials must be double-bagged and disposed of per S520 waste handling requirements.",
      standardReference: "IICRC S520:2015 §11.2",
      clauseRefs: ["IICRC S520:2015 §11.2"],
      isRequired: true,
    });
  }

  return items;
}
