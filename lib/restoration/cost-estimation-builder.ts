import {
  blockedPricing,
  priceListReader,
  sumOrBlocked,
  TOTAL_NOT_AVAILABLE_NOTE,
  type BlockedPricingLine,
  type BlockedRate,
} from "@/lib/pricing/blocked-line";
import { billableDailyRate } from "@/lib/equipment-matrix";
import {
  AMOUNT_TOO_LARGE_NOTE,
  equipmentLineAmount,
  equipmentLineBlockedFields,
  priceStoredEquipment,
  readStoredEquipment,
  UNUSABLE_LINE_LABEL,
  type PricedEquipment,
  type PricedEquipmentLine,
  type StoredEquipmentSelections,
} from "@/lib/reports/stored-equipment-pricing";
import { reconcilePricingSafety } from "@/lib/restoration/reconcile-pricing-safety";
import { deriveMouldActive } from "@/lib/restoration/plan-inputs";
import { getGstTreatment } from "@/lib/gst-rules";
/**
 * Exported for test. buildCostEstimationData is the pure builder that decides,
 * among much else, the mould flag handed to the safety reconciler --
 * the one thing on this priced document that must never contradict the
 * report for the same job. Reaching it through POST would mean mocking an
 * AI call and a credit ledger to assert a boolean.
 */
/** RA-8281: every price-list rate this builder reads. An unset one blocks the document. */
export const COST_ESTIMATION_RATE_FIELDS = [
  "administrationFee",
  "antimicrobialTreatmentRate",
  "biohazardTreatmentRate",
  "callOutFee",
  "extractionTruckMountedHourlyRate",
  "injectionDryingSystemDailyRate",
  "labourerNormalHours",
  "masterQualifiedNormalHours",
  "masterQualifiedSaturday",
  "mouldRemediationTreatmentRate",
  "qualifiedTechnicianNormalHours",
  "qualifiedTechnicianSaturday",
  "thermalCameraUseCostPerAssessment",
] as const;

export function buildCostEstimationData(data: {
  report: any;
  analysis: any;
  tier1: any;
  tier2: any;
  tier3: any;
  pricingConfig: any;
  stateInfo: any;
  scopeData: any;
  /** Opaque: only stored-equipment-pricing.ts reads inside it. */
  equipmentSelection?: StoredEquipmentSelections;
  psychrometricAssessment?: any;
  scopeAreas?: any[];
  gstTreatment: ReturnType<typeof getGstTreatment>;
}) {
  const {
    report,
    tier1,
    tier2,
    tier3,
    pricingConfig,
    stateInfo,
    scopeData,
    equipmentSelection,
    psychrometricAssessment,
    scopeAreas = [],
    gstTreatment,
  } = data;

  // Extract information
  const timelineRequirements =
    tier3?.T3_Q1_timelineRequirements || "No specific deadline";
  const isEmergency = timelineRequirements.includes("ASAP");
  const dryingPreferences = tier3?.T3_Q2_dryingPreferences || "Balanced";
  const isSpeedPriority = dryingPreferences.includes("Speed priority");

  const materials = tier1?.T1_Q6_materialsAffected || [];
  const hasYellowTongue = materials.some((m: string) =>
    m.includes("Yellow tongue"),
  );
  const class4Drying = tier3?.T3_Q5_class4DryingAssessment || "Uncertain";
  const needsClass4 =
    class4Drying.includes("Class 4") || class4Drying.includes("Class 3 or 4");

  const hazards = tier1?.T1_Q7_hazards || [];
  const hasAsbestos = hazards.some((h: string) => h.includes("asbestos"));
  const hasMould = hazards.some((h: string) => h.includes("mould"));
  const hasBiohazard = hazards.some((h: string) => h.includes("Biohazard"));

  const affectedArea = tier3?.T3_Q4_totalAffectedArea || "Not specified";
  // RA-7003: prefer structured room dimensions over free-text regex (same fix
  // as generate-scope-of-works — keep the two generators' m² identical).
  const structuredAreaSqm = Array.isArray(scopeAreas)
    ? scopeAreas.reduce(
        (sum: number, a: any) =>
          sum +
          (Number(a?.length) || 0) *
            (Number(a?.width) || 0) *
            ((Number(a?.wetPercentage) || 0) / 100),
        0,
      )
    : 0;
  const areaMatch =
    affectedArea.match(/(\d+)\s*sqm/i) || affectedArea.match(/=\s*(\d+)/);
  const affectedAreaSqm =
    structuredAreaSqm > 0
      ? Math.round(structuredAreaSqm * 10) / 10
      : areaMatch
        ? parseFloat(areaMatch[1])
        : 0; // No default - only use if provided

  // RA-8281 B1 round 13: the stored selection is read only through
  // stored-equipment-pricing.ts. Unit counts come from its validated lines.
  const storedEquipmentLines = readStoredEquipment(equipmentSelection);

  // Calculate equipment quantities from actual selections
  let airMoversQty = 0;
  let dehumidifiersQty = 0;
  let afdQty = 0;

  storedEquipmentLines.forEach((line) => {
    if (line.groupId.startsWith("airmover-")) {
      airMoversQty += line.quantity;
    } else if (
      line.groupId.startsWith("lgr-") ||
      line.groupId.startsWith("desiccant-")
    ) {
      dehumidifiersQty += line.quantity;
    } else if (line.groupId.includes("afd")) {
      afdQty += line.quantity;
    }
  });

  // Use actual drying duration from report if available, otherwise calculate
  const dryingDuration =
    report.estimatedDryingDuration || (needsClass4 ? 14 : 7);

  // Build cost categories
  const categories: any = {};

  // RA-8281 (B2): every rate is read through the shared price-list reader. A
  // line that needs a rate the contractor has not set is a blocked line: its
  // rate and amount are null (never $0: null * n === 0 in JS, so no rate is
  // ever multiplied directly), and every total that includes it is null.
  const P = priceListReader(pricingConfig);
  const MASTER = "masterQualifiedNormalHours";
  const QUALIFIED = "qualifiedTechnicianNormalHours";
  const LABOURER = "labourerNormalHours";
  /** rate and amount for `units` at one field's rate, blocked when unset. */
  const at = (field: string, units: number) => ({
    rate: P.calc([field], (r) => r),
    subtotal: P.calc([field], (r) => units * r),
    ...P.lineFields([field]),
  });
  const perSqm = (field: string) => ({
    sqm: affectedAreaSqm,
    ratePerSqm: P.calc([field], (r) => r),
    subtotal: P.calc([field], (r) => affectedAreaSqm * r),
    ...P.lineFields([field]),
  });

  // Labour - Emergency Response & Setup
  categories.emergencyResponse = {
    name: "Labour — Emergency Response & Setup (Day 0–1)",
    lineItems: [
      {
        description:
          "Master Qualified Technician — Site assessment, equipment staging, hazard identification",
        hours: 4,
        ...at(MASTER, 4),
      },
      {
        description:
          "Qualified Technician — Equipment setup, moisture readings, client briefing",
        hours: 6,
        ...at(QUALIFIED, 6),
      },
      {
        description:
          "Labourer — Equipment movement, containment barriers, debris management",
        hours: 4,
        ...at(LABOURER, 4),
      },
    ],
    total: P.calc(
      [MASTER, QUALIFIED, LABOURER],
      (m, q, l) => 4 * m + 6 * q + 4 * l,
    ),
  };

  // Labour - Ongoing Monitoring
  categories.ongoingMonitoring = {
    name: "Labour — Ongoing Monitoring (Days 1–7)",
    lineItems: [
      {
        description:
          "Qualified Technician — Daily site visits, moisture meter readings, equipment checks",
        hours: dryingDuration,
        ...at(QUALIFIED, dryingDuration),
      },
    ],
    total: P.calc([QUALIFIED], (q) => dryingDuration * q),
  };

  // Labour - Drying Protocol Specialist (if Class 3/4)
  if (needsClass4) {
    categories.dryingProtocol = {
      name: "Labour — Drying Protocol Specialist (Class 3/4)",
      lineItems: [
        {
          description:
            "Master Qualified Technician — Sandwich drying setup, injection system configuration",
          hours: 12,
          ...at(MASTER, 12),
        },
        {
          description: "Qualified Technician — Setup support, monitoring",
          hours: 8,
          ...at(QUALIFIED, 8),
        },
      ],
      total: P.calc([MASTER, QUALIFIED], (m, q) => 12 * m + 8 * q),
    };
  }

  // Labour - Final Validation
  categories.finalValidation = {
    name: "Labour — Final Validation & Collection (Day 7–8)",
    lineItems: [
      {
        description:
          "Master Qualified Technician — Final moisture assessment, thermal imaging, certification",
        hours: 2,
        ...at(MASTER, 2),
      },
      {
        description:
          "Qualified Technician + Labourer — Equipment collection, site cleanup",
        hours: 4,
        rate: P.calc([QUALIFIED, LABOURER], (q, l) => (q + l) / 2),
        subtotal: P.calc([QUALIFIED, LABOURER], (q, l) => 2 * q + 2 * l),
        ...P.lineFields([QUALIFIED, LABOURER]),
      },
    ],
    total: P.calc(
      [MASTER, QUALIFIED, LABOURER],
      (m, q, l) => 2 * m + 2 * q + 2 * l,
    ),
  };

  // After-hours (if emergency)
  if (isEmergency) {
    // Hours are filled in by the client later, so each amount is 0 today. The
    // rate is still printed on the line, so an unset rate blocks the line and
    // the total: the document never shows a Saturday line without its rate.
    const afterHours = (field: string) => ({
      hours: 0, // To be filled by client
      rate: P.calc([field], (r) => r),
      subtotal: P.calc([field], () => 0),
      ...P.lineFields([field]),
    });
    categories.afterHours = {
      name: "Labour — After-Hours or Weekend (Emergency)",
      lineItems: [
        {
          description: "Master Qualified Technician — Saturday rates",
          ...afterHours("masterQualifiedSaturday"),
        },
        {
          description: "Qualified Technician — Saturday rates",
          ...afterHours("qualifiedTechnicianSaturday"),
        },
      ],
      total: P.calc(
        ["masterQualifiedSaturday", "qualifiedTechnicianSaturday"],
        () => 0,
      ),
    };
  }

  // Call-Out Fees
  categories.callOut = {
    name: "Call-Out Fees",
    lineItems: [
      {
        description: "Minimal Call-Out Fee",
        qty: 1,
        rate: P.calc(["callOutFee"], (r) => r),
        subtotal: P.calc(["callOutFee"], (r) => r),
        ...P.lineFields(["callOutFee"]),
      },
    ],
    total: P.calc(["callOutFee"], (r) => r),
  };

  // Equipment Rental - Use actual equipment selection data (only include if user selected)
  let equipmentBlocked: PricedEquipment | null = null;
  if (storedEquipmentLines.length > 0) {
    // RA-8281 B1 round 13: priced from the current price list by the one
    // reader. B2: a line whose rate is not set, or that cannot be read, is
    // shown as a blocked line and the category total is null. It is never a
    // $0 line and never left out.
    const pricedEquipment = priceStoredEquipment(
      equipmentSelection,
      pricingConfig,
      dryingDuration,
    );
    if (pricedEquipment.total === null) equipmentBlocked = pricedEquipment;

    categories.equipment = {
      name: "Equipment Rental",
      lineItems: [],
      total: 0,
    };

    // Group equipment by type for better organization. Each line lands in the
    // first kind it matches; a line of no known kind is listed last, so no
    // priced line is left out of the total.
    const kinds: Array<(line: PricedEquipmentLine) => boolean> = [
      (l) => l.groupId.startsWith("lgr-"),
      (l) => l.groupId.startsWith("desiccant-"),
      (l) => l.groupId.startsWith("airmover-"),
      (l) => l.groupId.startsWith("heat-"),
      (l) => l.groupId.includes("afd"),
      () => true,
    ];
    const placed = new Set<PricedEquipmentLine>();
    for (const matches of kinds) {
      for (const line of pricedEquipment.lines) {
        if (placed.has(line) || !matches(line)) continue;
        placed.add(line);
        // A usable line of zero units adds nothing. A line with no amount
        // (it cannot be read, or its rate is not set, whatever its
        // quantity) blocks the total, so it is always shown.
        if (line.quantity <= 0 && line.total !== null) continue;
        categories.equipment.lineItems.push({
          description: line.usable ? line.name : UNUSABLE_LINE_LABEL,
          qty: line.quantity,
          days: dryingDuration,
          dailyRate: line.dailyRate,
          subtotal: line.total,
          ...equipmentLineBlockedFields(line),
        });
      }
    }
    // The category total is the reader's job total, summed there in whole
    // cents. Adding the rows here as binary numbers drifts (three rows of
    // $66.68 came to 200.04000000000002). null when any line is blocked.
    categories.equipment.total = pricedEquipment.total;
  }

  // Equipment Rental - Extraction
  categories.extraction = {
    name: "Equipment Rental — Extraction",
    lineItems: [
      {
        description: "Truck-Mounted Extraction Unit",
        hours: 4,
        ...at("extractionTruckMountedHourlyRate", 4),
      },
    ],
    total: P.calc(["extractionTruckMountedHourlyRate"], (r) => 4 * r),
  };

  // Equipment Rental - Drying Systems (if Class 4)
  if (needsClass4 && hasYellowTongue) {
    // The billable rate and a whole-cent amount, as for every equipment line.
    const INJECTION = "injectionDryingSystemDailyRate";
    const injectionTotal = P.calc([INJECTION], (r) => {
      const amount = equipmentLineAmount(
        billableDailyRate(r),
        1,
        dryingDuration,
      );
      if (amount === null) throw new RangeError(AMOUNT_TOO_LARGE_NOTE);
      return amount;
    });
    categories.dryingSystems = {
      name: "Equipment Rental — Drying Systems (Class 3/4)",
      lineItems: [
        {
          description:
            "Injection Drying System (thermal mats, injection equipment)",
          qty: 1,
          days: dryingDuration,
          dailyRate: P.calc([INJECTION], (r) => billableDailyRate(r)),
          subtotal: injectionTotal,
          ...P.lineFields([INJECTION]),
        },
      ],
      total: injectionTotal,
    };
  }

  // Thermal Imaging
  categories.thermalImaging = {
    name: "Thermal Imaging & Moisture Assessment",
    lineItems: [
      {
        description:
          "Thermal Camera Claim Use Cost — 3 assessments (Days 0, 3, 7)",
        qty: 3,
        ...at("thermalCameraUseCostPerAssessment", 3),
      },
    ],
    total: P.calc(["thermalCameraUseCostPerAssessment"], (r) => 3 * r),
  };

  // Chemical Treatment - Only include if user actually selected/needs it
  // Only add if affectedAreaSqm > 0 (user provided area) and hazards are present
  if (
    affectedAreaSqm > 0 &&
    (hasMould || hasBiohazard || tier3?.T3_Q3_chemicalTreatment)
  ) {
    const chemicalLines: any[] = [];

    // Standard antimicrobial treatment (if no specific hazard)
    if (!hasMould && !hasBiohazard && tier3?.T3_Q3_chemicalTreatment) {
      chemicalLines.push({
        description: "Anti-microbial Treatment",
        ...perSqm("antimicrobialTreatmentRate"),
      });
    }

    // Mould remediation (only if mould hazard identified)
    if (hasMould) {
      chemicalLines.push({
        description: "Mould Remediation Treatment",
        ...perSqm("mouldRemediationTreatmentRate"),
      });
    }

    // Biohazard treatment (only if biohazard identified)
    if (hasBiohazard) {
      chemicalLines.push({
        description: "Bio-Hazard Treatment",
        ...perSqm("biohazardTreatmentRate"),
      });
    }

    categories.chemicalTreatment = {
      name: "Chemical Treatment",
      lineItems: chemicalLines,
      total: sumOrBlocked([0, ...chemicalLines.map((l) => l.subtotal)]),
    };
  }

  // Administration Fee
  categories.administration = {
    name: "Administration Fee",
    lineItems: [
      {
        description: "Claim Processing, Documentation, Report Generation",
        qty: 1,
        rate: P.calc(["administrationFee"], (r) => r),
        subtotal: P.calc(["administrationFee"], (r) => r),
        ...P.lineFields(["administrationFee"]),
      },
    ],
    total: P.calc(["administrationFee"], (r) => r),
  };

  // Calculate totals. A category total of null (a blocked line) makes every
  // total that includes it null: no total is a partial sum.
  const totalOf = (c: any): number | null =>
    !c ? 0 : c.total === null ? null : c.total || 0;
  const sumCategories = (match: string) =>
    sumOrBlocked([
      0,
      ...Object.values(categories)
        .filter((c: any) => c.name.includes(match))
        .map(totalOf),
    ]);
  const totalLabour = sumCategories("Labour");
  const totalEquipment = sumCategories("Equipment");

  const totalChemicals = totalOf(categories.chemicalTreatment);
  const totalAdmin = totalOf(categories.administration);
  const totalCallOut = totalOf(categories.callOut);
  const totalThermal = totalOf(categories.thermalImaging);

  const subtotal = sumOrBlocked([
    totalLabour,
    totalEquipment,
    totalChemicals,
    totalAdmin,
    totalCallOut,
    totalThermal,
  ]);
  const gst = subtotal === null ? null : subtotal * gstTreatment.rate;
  const totalIncGST = subtotal === null || gst === null ? null : subtotal + gst;

  // RA-8281 (B2): what blocks this document, if anything. Unset price-list
  // rates name their field; an equipment line that cannot be read carries
  // its note only. Neither carries a national range figure.
  const missing = documentMissing(P.missing(), equipmentBlocked);

  // Industry comparison
  const industryAverage = { min: 6500, max: 12000 };
  const costAnalysis =
    subtotal === null
      ? TOTAL_NOT_AVAILABLE_NOTE
      : subtotal < industryAverage.min
      ? "Below average (client may offer discount/aggressive pricing)"
      : subtotal > industryAverage.max
        ? "Above average (may warrant specialist services or complex claim justification)"
        : "Within range (market standard)";

  // Cost drivers
  const costDrivers = [];
  if (
    totalEquipment !== null &&
    totalLabour !== null &&
    totalEquipment > totalLabour
  ) {
    costDrivers.push(
      `${airMoversQty} air movers × ${dryingDuration} days (most significant equipment cost)`,
    );
  }
  if (needsClass4) {
    costDrivers.push("Sandwich drying system rental (Class 4 complexity)");
  }
  if (isEmergency) {
    costDrivers.push("After-hours Saturday call-out premium");
  }

  // Flagged items
  const flaggedItems = [];
  if (needsClass4) {
    flaggedItems.push({
      flag: "Class 4 Drying Flagged",
      reason:
        "Tier 1/2 responses indicated possible yellow tongue or structural saturation",
      action:
        "Qualified Master Technician must assess on-site before final quote. System provides placeholder; actual cost TBD.",
    });
  }
  if (hasAsbestos || hasMould || hasBiohazard) {
    flaggedItems.push({
      flag: "Hazard Cost TBD",
      reason: `${hasAsbestos ? "Asbestos" : ""} ${hasMould ? "Mould" : ""} ${hasBiohazard ? "Biohazard" : ""} suspected or confirmed`,
      action:
        "Specialist assessment required. Cannot estimate until specialist provides quote. Insurance pre-approval recommended.",
    });
  }
  if (scopeData?.licensedTrades?.length > 0) {
    flaggedItems.push({
      flag: "Multi-Phase Timeline",
      reason:
        "Licensed trades (plumbing, electrical) must be coordinated before drying begins",
      action:
        "Verify availability with plumber/electrician. Delays may extend equipment rental costs.",
    });
  }

  // RA-7006 Gap 1: reconcile the priced equipment against the RA-7005 safety
  // plan so the estimate can never silently contradict the report's safety
  // sequence (mould air-mover gate + derated power budget). Robust mould
  // detection also consults Report.biologicalMouldDetected (Gap 3).
  // The SAFETY flag is derived with the shared helper, NOT with `hasMould`
  // above. `hasMould` reads only the tier-1 hazard TICKBOXES, so it misses
  // mould recorded in `T1_Q7_hazardsOther` (the free text beside "Other" on
  // that same question), in the technician's written report, in `hazardType`,
  // or spelled the American way. The report acts on all of those, so a job
  // could be classified mould-active while THIS document was priced with mould
  // off and carried Phase 1 air movers. Same defect as #2149/#2150/#2151.
  //
  // `hasMould` is deliberately left alone: it also drives PRICED lines (mould
  // remediation treatment, PPE, hazard surcharges), and widening those would
  // start charging mould remediation on a prose mention. That is a repricing,
  // not a safety fix. The two therefore differ on purpose.
  const mouldActiveForSafety = deriveMouldActive({
    biologicalMouldDetected: report.biologicalMouldDetected,
    biologicalMouldCategory: report.biologicalMouldCategory,
    hazardType: report.hazardType,
    hazards,
    technicianFieldReport: report.technicianFieldReport,
    tier1,
  });
  const safety = reconcilePricingSafety({
    scopeAreas,
    // Scope rows are the better source, but they are often absent: the area
    // then comes from the affected-area text ("45 sqm") or Report.affectedArea.
    // Passing only `scopeAreas` meant the reconciler saw ZERO area on those
    // jobs and silently skipped the equipment plan and every power advisory --
    // the mould gate still fired, but nothing checked the load fit the supply.
    // `affectedAreaM2` takes precedence only when it is > 0, so a job with real
    // scope rows is unaffected.
    affectedAreaM2: affectedAreaSqm > 0 ? affectedAreaSqm : undefined,
    // The validated lines, not the raw stored value. `type` carries the
    // equipment group id so the air-mover gate sees stored selections.
    equipmentSelection: storedEquipmentLines.map((line) => ({
      type: line.groupId,
      quantity: line.quantity,
    })),
    waterCategory: report.waterCategory,
    mouldActive: mouldActiveForSafety,
    hazards,
    powerAssessment:
      report.inspection?.powerCircuits && report.inspection?.powerCircuitRatingA
        ? {
            circuits: report.inspection.powerCircuits,
            circuitRatingA: report.inspection.powerCircuitRatingA,
            deratePct: report.inspection.powerDeratePct ?? 0.8,
          }
        : undefined,
  });

  return {
    reportId: report.id,
    claimReference: report.claimReferenceNumber || report.reportNumber,
    date: new Date().toLocaleDateString("en-AU"),
    version: 1,
    categories,
    totals: {
      totalLabour,
      totalEquipment,
      totalChemicals,
      totalAdmin: sumOrBlocked([totalAdmin, totalCallOut, totalThermal]),
      subtotal,
      gst,
      totalIncGST,
      gstPercentLabel: gstTreatment.percentLabel,
      currency: gstTreatment.currency,
    },
    industryComparison: {
      average: industryAverage,
      estimated: subtotal,
      analysis: costAnalysis,
    },
    costDrivers,
    flaggedItems,
    affectedAreaSqm,
    dryingDuration,
    needsClass4,
    hasHazards: hasAsbestos || hasMould || hasBiohazard,
    safety,
    stateInfo,
    // RA-8281 (B2): present only when a line is blocked. A blocked document
    // is shown to the contractor and never saved.
    ...(subtotal === null
      ? {
          blockedPricing: blockedPricing(
            categoryPricingLines(categories),
            missing,
          ),
        }
      : {}),
  };
}

/**
 * RA-8281 (B2): every unset price-list rate and every equipment problem that
 * blocks a document, once each. Shared by the cost estimation and the scope
 * of works builders.
 */
export function documentMissing(
  unsetRates: BlockedRate[],
  equipment: PricedEquipment | null,
): BlockedRate[] {
  const missing = [...unsetRates];
  if (!equipment) return missing;
  for (const u of equipment.unset) {
    if (!missing.some((m) => m.field === u.field)) {
      missing.push({ field: u.field, note: u.note });
    }
  }
  for (const note of equipment.problems) {
    if (!missing.some((m) => m.note === note)) {
      missing.push({ field: "equipmentSelection", note });
    }
  }
  return missing;
}

/** The cost estimation's category lines in the shared blocked-pricing shape. */
function categoryPricingLines(categories: any): BlockedPricingLine[] {
  return Object.values(categories).flatMap((category: any) =>
    category.lineItems.map((item: any): BlockedPricingLine => {
      const [quantity, unit] =
        item.sqm !== undefined
          ? [item.sqm, "m²"]
          : item.hours !== undefined
            ? [item.hours, "hr"]
            : item.days !== undefined
              ? [item.qty, `unit × ${item.days} days`]
              : [item.qty ?? null, null];
      const rate = item.rate ?? item.dailyRate ?? item.ratePerSqm ?? null;
      return {
        description: `${category.name}: ${item.description}`,
        quantity,
        unit,
        rate,
        subtotal: item.subtotal ?? null,
        pricingStatus: item.pricingStatus ?? "priced",
        rateField: item.rateField,
        pricingNote: item.pricingNote,
      };
    }),
  );
}

// Build the complete cost estimation document server-side with exact values
