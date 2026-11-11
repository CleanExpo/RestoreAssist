import {
  blockedPricing,
  nationalRangeFor,
  priceListReader,
  sumOrBlocked,
} from "@/lib/pricing/blocked-line";
import { billableDailyRate } from "@/lib/equipment-matrix";
import {
  AMOUNT_TOO_LARGE_NOTE,
  equipmentLineAmount,
  equipmentLineBlockedFields,
  priceStoredEquipment,
  readStoredEquipment,
  UNUSABLE_LINE_LABEL,
  type StoredEquipmentSelections,
} from "@/lib/reports/stored-equipment-pricing";
import { documentMissing } from "@/lib/restoration/cost-estimation-builder";
import { reconcilePricingSafety } from "@/lib/restoration/reconcile-pricing-safety";
import { deriveMouldActive } from "@/lib/restoration/plan-inputs";
import { extractWaterCategory } from "@/lib/reports/extract-report-data";
/**
 * Exported for test. buildScopeOfWorksData is the pure builder that decides,
 * among much else, the mould flag handed to the safety reconciler --
 * the one thing on this priced document that must never contradict the
 * report for the same job. Reaching it through POST would mean mocking an
 * AI call and a credit ledger to assert a boolean.
 */
/** RA-8281: every price-list rate this builder reads. An unset one blocks the document. */
export const SCOPE_OF_WORKS_RATE_FIELDS = [
  "administrationFee",
  "afdUnitLargeDailyRate",
  "airMoverAxialDailyRate",
  "antimicrobialTreatmentRate",
  "biohazardTreatmentRate",
  "callOutFee",
  "dehumidifierLGRDailyRate",
  "extractionTruckMountedHourlyRate",
  "injectionDryingSystemDailyRate",
  "labourerNormalHours",
  "masterQualifiedNormalHours",
  "mouldRemediationTreatmentRate",
  "qualifiedTechnicianNormalHours",
  "thermalCameraUseCostPerAssessment",
] as const;

export function buildScopeOfWorksData(data: {
  report: any;
  analysis: any;
  tier1: any;
  tier2: any;
  tier3: any;
  pricingConfig: any;
  stateInfo: any;
  /** Opaque: only stored-equipment-pricing.ts reads inside it. */
  equipmentSelection?: StoredEquipmentSelections;
  psychrometricAssessment?: any;
  scopeAreas?: any[];
}) {
  const {
    report,
    analysis,
    tier1,
    tier2,
    tier3,
    pricingConfig,
    stateInfo,
    equipmentSelection,
    psychrometricAssessment,
    scopeAreas = [],
  } = data;
  if (!pricingConfig) {
    throw new Error("Pricing configuration is required");
  }

  // Extract key information
  const waterCategory = tier1?.T1_Q3_waterSource
    ? extractWaterCategory(tier1.T1_Q3_waterSource)
    : report.waterCategory || analysis?.waterCategory || "Category 1";

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

  const structuralConcerns = tier2?.T2_Q5_structuralConcerns || [];
  const needsBuilder =
    structuralConcerns.length > 0 &&
    !structuralConcerns.includes("None identified");

  const buildingServices = tier2?.T2_Q6_buildingServicesAffected || [];
  const needsElectrician = buildingServices.some((s: string) =>
    s.includes("Electrical"),
  );
  const needsPlumber =
    tier1?.T1_Q3_waterSource?.includes("pipe") ||
    tier1?.T1_Q3_waterSource?.includes("toilet");

  const affectedArea = tier3?.T3_Q4_totalAffectedArea || "Not specified";

  // RA-7003: prefer the structured room dimensions the user actually entered
  // (length × width × wet%) over regexing tier-3 free text — the free-text
  // parse silently priced chemical treatment at 0 m² whenever the phrasing
  // didn't match.
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
        : report.affectedArea
          ? parseFloat(String(report.affectedArea))
          : 0;

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

  // Use actual drying duration from report if available, otherwise calculate based on data
  const dryingDuration =
    report.estimatedDryingDuration ||
    analysis?.estimatedDryingDuration ||
    (tier3?.T3_Q2_dryingPreferences
      ? parseInt(
          tier3.T3_Q2_dryingPreferences.match(/(\d+)\s*days?/i)?.[1] || "0",
        )
      : null) ||
    (needsClass4 ? 14 : affectedAreaSqm > 50 ? 10 : 7);

  // Calculate extraction hours based on affected area or use from analysis
  // Standard: 1 hour per 25 sqm, minimum 2 hours, maximum 8 hours
  const extractionHours =
    analysis?.extractionHours ||
    (affectedAreaSqm > 0
      ? Math.max(2, Math.min(8, Math.ceil(affectedAreaSqm / 25)))
      : 4);

  // RA-8281 B1 round 13: equipment is priced from the current price list by
  // the one reader. B2: an unset rate, or an equipment line that cannot be
  // read, makes the line that needs it a blocked line (no rate, no amount).
  // It is never a $0 line and never left out.
  const pricedEquipment = priceStoredEquipment(
    equipmentSelection,
    pricingConfig,
    dryingDuration,
  );
  const equipmentBlocked =
    pricedEquipment.total === null ? pricedEquipment : null;

  // RA-8281 (B2): every rate is read through the shared price-list reader. No
  // rate is multiplied directly (null * n === 0 in JS): a figure that needs
  // an unset rate is null.
  const P = priceListReader(pricingConfig);
  const MASTER = "masterQualifiedNormalHours";
  const QUALIFIED = "qualifiedTechnicianNormalHours";
  const LABOURER = "labourerNormalHours";
  const THERMAL = "thermalCameraUseCostPerAssessment";
  const INJECTION = "injectionDryingSystemDailyRate";
  const rate = (field: string) => P.calc([field], (r) => r);
  /** The blocked-line fields for a line that reads `fields` (and equipment). */
  const blockedBy = (fields: string[], withEquipment = false) => {
    const byRate = P.lineFields(fields);
    if (!withEquipment || !equipmentBlocked) return byRate;
    const equipmentNote = equipmentBlocked.problems.join(" ");
    if ("pricingStatus" in byRate) {
      return {
        ...byRate,
        pricingNote: `${byRate.pricingNote} ${equipmentNote}`.trim(),
      };
    }
    const [unset] = equipmentBlocked.unset;
    return unset
      ? {
          pricingStatus: "rate_not_set" as const,
          rateField: unset.field,
          pricingNote: equipmentNote,
          nationalRange: nationalRangeFor(unset.field),
        }
      : { pricingStatus: "unusable_line" as const, pricingNote: equipmentNote };
  };
  const assessmentCount = dryingDuration >= 7 ? 3 : dryingDuration >= 4 ? 2 : 1;

  const lineItems: any[] = [
    {
      id: "RW_1",
      description: "Emergency Call-Out & Site Assessment",
      qty: 1,
      unit: "Call-out",
      rate: rate("callOutFee"),
      subtotal: rate("callOutFee"),
      ...blockedBy(["callOutFee"]),
    },
    {
      id: "RW_2",
      description: "Standing Water Extraction (Truck-Mounted Unit)",
      qty: extractionHours,
      unit: "Hour",
      rate: rate("extractionTruckMountedHourlyRate"),
      subtotal: P.calc(
        ["extractionTruckMountedHourlyRate"],
        (r) => extractionHours * r,
      ),
      ...blockedBy(["extractionTruckMountedHourlyRate"]),
    },
    {
      id: "RW_3",
      description: "Initial Drying Equipment Deployment & Setup",
      qty: 1,
      unit: "Setup",
      labour: {
        masterQualified: { hours: 4, rate: rate(MASTER) },
        qualified: { hours: 6, rate: rate(QUALIFIED) },
      },
      equipment: pricedEquipment.lines.reduce((acc: any, line) => {
        // A usable line of zero units adds nothing. A line that cannot be
        // read has quantity 0 too, but it blocks the amount, so it is listed.
        if (line.quantity > 0 || !line.usable) {
          const key = !line.usable
            ? "other"
            : line.groupId.startsWith("lgr-")
              ? "lgr"
              : line.groupId.startsWith("desiccant-")
                ? "desiccant"
                : line.groupId.startsWith("airmover-")
                  ? "airMovers"
                  : line.groupId.startsWith("heat-")
                    ? "heat"
                    : line.groupId.includes("afd")
                      ? "afd"
                      : "other";

          if (!acc[key]) {
            acc[key] = {
              qty: 0,
              days: dryingDuration,
              rate: line.dailyRate,
              items: [],
            };
          }
          acc[key].qty += line.quantity;
          acc[key].items.push({
            groupId: line.groupId,
            name: line.usable ? line.name : UNUSABLE_LINE_LABEL,
            quantity: line.quantity,
            dailyRate: line.dailyRate,
            ...equipmentLineBlockedFields(line),
          });
        }
        return acc;
      }, {}),
      subtotal: sumOrBlocked([
        P.calc([MASTER, QUALIFIED], (m, q) => 4 * m + 6 * q),
        pricedEquipment.total,
      ]),
      ...blockedBy([MASTER, QUALIFIED], true),
    },
    {
      id: "RW_4",
      description: "Moisture Assessment & Thermal Imaging",
      qty: assessmentCount, // Standard: 3 assessments for 7+ days, 2 for 4-6 days, 1 for shorter
      unit:
        dryingDuration >= 7
          ? "Assessment (Days 0, 3, 7)"
          : dryingDuration >= 4
            ? "Assessment (Days 0, Final)"
            : "Assessment (Day 0)",
      labour: {
        masterQualified: { hours: assessmentCount, rate: rate(MASTER) },
      },
      equipment: {
        thermalCamera: { qty: assessmentCount, rate: rate(THERMAL) },
      },
      subtotal: P.calc(
        [MASTER, THERMAL],
        (m, t) => assessmentCount * m + assessmentCount * t,
      ),
      ...blockedBy([MASTER, THERMAL]),
    },
    {
      id: "RW_5",
      description: "Daily Site Monitoring & Moisture Logging",
      qty: dryingDuration,
      unit: "Day",
      labour: {
        qualified: { hours: dryingDuration, rate: rate(QUALIFIED) },
      },
      subtotal: P.calc([QUALIFIED], (q) => dryingDuration * q),
      ...blockedBy([QUALIFIED]),
    },
  ];

  // Add RW_6 only if Class 4 drying is needed
  if (needsClass4 && hasYellowTongue) {
    // The billable rate (to the whole cent), as for every equipment line.
    const injectionRate = P.calc([INJECTION], (r) => billableDailyRate(r));
    lineItems.push({
      id: "RW_6",
      description: "Drying Protocol — Yellow Tongue Sandwich Drying",
      qty: 1,
      unit: "Application",
      labour: {
        masterQualified: { hours: 12, rate: rate(MASTER) },
        qualified: { hours: 8, rate: rate(QUALIFIED) },
      },
      equipment: {
        injectionSystem: { qty: 1, days: dryingDuration, rate: injectionRate },
      },
      subtotal: P.calc([MASTER, QUALIFIED, INJECTION], (m, q, i) => {
        const injectionTotal = equipmentLineAmount(
          billableDailyRate(i),
          1,
          dryingDuration,
        );
        if (injectionTotal === null) throw new RangeError(AMOUNT_TOO_LARGE_NOTE);
        return 12 * m + 8 * q + injectionTotal;
      }),
      ...blockedBy([MASTER, QUALIFIED, INJECTION]),
    });
  }

  // Add RW_7 - Chemical treatment (use actual selection or determine from context)
  const chemicalType =
    tier3?.T3_Q3_chemicalTreatment ||
    analysis?.chemicalTreatment ||
    (hasMould
      ? "Mould remediation treatment"
      : hasBiohazard
        ? "Biohazard treatment"
        : "Standard antimicrobial treatment");
  let chemicalField = "antimicrobialTreatmentRate";
  if (chemicalType.includes("mould")) {
    chemicalField = "mouldRemediationTreatmentRate";
  } else if (chemicalType.includes("Biohazard") || hasBiohazard) {
    chemicalField = "biohazardTreatmentRate";
  }

  lineItems.push({
    id: "RW_7",
    description: "Antimicrobial Chemical Treatment",
    qty: affectedAreaSqm,
    unit: "Sqm",
    rate: rate(chemicalField),
    subtotal: P.calc([chemicalField], (r) => affectedAreaSqm * r),
    ...blockedBy([chemicalField]),
  });

  lineItems.push({
    id: "RW_8",
    description: "Equipment Collection & Site Cleanup",
    qty: 1,
    unit: "Removal",
    labour: {
      qualified: { hours: 2, rate: rate(QUALIFIED) },
      labourer: { hours: 2, rate: rate(LABOURER) },
    },
    subtotal: P.calc([QUALIFIED, LABOURER], (q, l) => 2 * q + 2 * l),
    ...blockedBy([QUALIFIED, LABOURER]),
  });

  lineItems.push({
    id: "RW_9",
    description: "Final Drying Certification & Report",
    qty: 1,
    unit: "Certification",
    labour: {
      masterQualified: { hours: 2, rate: rate(MASTER) },
    },
    subtotal: P.calc([MASTER], (m) => 2 * m),
    ...blockedBy([MASTER]),
  });

  lineItems.push({
    id: "RW_10",
    description: "Administration & Documentation Fee",
    qty: 1,
    unit: "Claim",
    rate: rate("administrationFee"),
    subtotal: rate("administrationFee"),
    ...blockedBy(["administrationFee"]),
  });

  // RA-8281 (B2): present only when a line is blocked. A blocked document is
  // shown to the contractor and never saved.
  const blocked = lineItems.some((item) => item.subtotal === null)
    ? blockedPricing(
        lineItems.map((item) => ({
          description: `${item.id}: ${item.description}`,
          quantity: item.qty,
          unit: item.unit,
          rate: item.rate ?? null,
          subtotal: item.subtotal,
          pricingStatus: item.pricingStatus ?? "priced",
          rateField: item.rateField,
          pricingNote: item.pricingNote,
          nationalRange: item.nationalRange,
        })),
        documentMissing(P.missing(), equipmentBlocked),
      )
    : null;

  // Licensed trades
  const licensedTrades = [];
  if (needsPlumber) {
    licensedTrades.push({
      trade: "Plumbing",
      trigger: "Burst pipe identified",
      scope:
        "Assessment, repair/replacement of damaged pipe, water testing, WaterMark certification",
      costStatus: "Specialist quote required",
      timeline: "1-3 days (must be completed BEFORE drying begins)",
    });
  }
  if (needsElectrician) {
    licensedTrades.push({
      trade: "Electrical",
      trigger: "Outlets/circuits in wet areas",
      scope:
        "Safety inspection, circuit testing, outlet replacement if damaged, RCD/RCBO installation",
      costStatus: "Specialist quote required",
      timeline: "1-2 days (before restoration begins)",
    });
  }
  if (needsBuilder) {
    licensedTrades.push({
      trade: "Builder/Carpenter",
      trigger: "Structural damage identified",
      scope:
        "Structural assessment, yellow tongue subfloor replacement if needed, wall/ceiling repairs",
      costStatus: "Specialist quote required",
      timeline: "3-10 days depending on scope",
    });
  }
  if (hasMould) {
    licensedTrades.push({
      trade: "Mould Remediation (IICRC S520 Certified)",
      trigger: "Active mould growth detected",
      scope:
        "Mould assessment, containment setup, professional remediation, clearance testing",
      costStatus:
        "Specialist quote required (can significantly increase claim cost)",
      timeline: "5-14 days depending on extent",
    });
  }
  if (hasAsbestos) {
    licensedTrades.push({
      trade: "Asbestos Assessment & Abatement",
      trigger: "Suspected or confirmed asbestos materials",
      scope:
        "Licensed assessor confirms presence; licensed abatement contractor safely removes",
      costStatus:
        "Specialist quote required (usually $5K–$15K+ depending on extent)",
      timeline: "Assessment 3-5 days; removal 5-10 days",
    });
  }

  // RA-7006 Gap 1: reconcile the scoped equipment against the RA-7005 safety
  // plan (mould air-mover gate + derated power budget). Robust mould detection
  // also consults Report.biologicalMouldDetected (Gap 3).
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
    waterCategory,
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
    lineItems,
    licensedTrades,
    stateInfo,
    waterCategory,
    dryingDuration,
    affectedAreaSqm,
    hasClass4Drying: needsClass4,
    hazards: hazards.filter((h: string) => h !== "None identified"),
    safety,
    ...(blocked ? { blockedPricing: blocked } : {}),
  };
}

