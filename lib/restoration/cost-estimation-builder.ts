import { getEquipmentGroupById, getEquipmentDailyRate } from "@/lib/equipment-matrix";
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
export function buildCostEstimationData(data: {
  report: any;
  analysis: any;
  tier1: any;
  tier2: any;
  tier3: any;
  pricingConfig: any;
  stateInfo: any;
  scopeData: any;
  equipmentSelection?: any[];
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
    equipmentSelection = [],
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

  // Use actual equipment selection data if available, otherwise use 0 (no defaults)
  const equipmentSelections = Array.isArray(equipmentSelection)
    ? equipmentSelection
    : [];

  // Calculate equipment quantities from actual selections
  let airMoversQty = 0;
  let dehumidifiersQty = 0;
  let afdQty = 0;

  equipmentSelections.forEach((sel: any) => {
    if (sel.groupId && sel.quantity) {
      if (sel.groupId.startsWith("airmover-")) {
        airMoversQty += sel.quantity || 0;
      } else if (
        sel.groupId.startsWith("lgr-") ||
        sel.groupId.startsWith("desiccant-")
      ) {
        dehumidifiersQty += sel.quantity || 0;
      } else if (sel.groupId.includes("afd")) {
        afdQty += sel.quantity || 0;
      }
    }
  });

  // Use actual drying duration from report if available, otherwise calculate
  const dryingDuration =
    report.estimatedDryingDuration || (needsClass4 ? 14 : 7);

  // Build cost categories
  const categories: any = {};

  // Labour - Emergency Response & Setup
  categories.emergencyResponse = {
    name: "Labour — Emergency Response & Setup (Day 0–1)",
    lineItems: [
      {
        description:
          "Master Qualified Technician — Site assessment, equipment staging, hazard identification",
        hours: 4,
        rate: pricingConfig.masterQualifiedNormalHours,
        subtotal: 4 * pricingConfig.masterQualifiedNormalHours,
      },
      {
        description:
          "Qualified Technician — Equipment setup, moisture readings, client briefing",
        hours: 6,
        rate: pricingConfig.qualifiedTechnicianNormalHours,
        subtotal: 6 * pricingConfig.qualifiedTechnicianNormalHours,
      },
      {
        description:
          "Labourer — Equipment movement, containment barriers, debris management",
        hours: 4,
        rate: pricingConfig.labourerNormalHours,
        subtotal: 4 * pricingConfig.labourerNormalHours,
      },
    ],
    total:
      4 * pricingConfig.masterQualifiedNormalHours +
      6 * pricingConfig.qualifiedTechnicianNormalHours +
      4 * pricingConfig.labourerNormalHours,
  };

  // Labour - Ongoing Monitoring
  categories.ongoingMonitoring = {
    name: "Labour — Ongoing Monitoring (Days 1–7)",
    lineItems: [
      {
        description:
          "Qualified Technician — Daily site visits, moisture meter readings, equipment checks",
        hours: dryingDuration,
        rate: pricingConfig.qualifiedTechnicianNormalHours,
        subtotal: dryingDuration * pricingConfig.qualifiedTechnicianNormalHours,
      },
    ],
    total: dryingDuration * pricingConfig.qualifiedTechnicianNormalHours,
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
          rate: pricingConfig.masterQualifiedNormalHours,
          subtotal: 12 * pricingConfig.masterQualifiedNormalHours,
        },
        {
          description: "Qualified Technician — Setup support, monitoring",
          hours: 8,
          rate: pricingConfig.qualifiedTechnicianNormalHours,
          subtotal: 8 * pricingConfig.qualifiedTechnicianNormalHours,
        },
      ],
      total:
        12 * pricingConfig.masterQualifiedNormalHours +
        8 * pricingConfig.qualifiedTechnicianNormalHours,
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
        rate: pricingConfig.masterQualifiedNormalHours,
        subtotal: 2 * pricingConfig.masterQualifiedNormalHours,
      },
      {
        description:
          "Qualified Technician + Labourer — Equipment collection, site cleanup",
        hours: 4,
        rate:
          (pricingConfig.qualifiedTechnicianNormalHours +
            pricingConfig.labourerNormalHours) /
          2,
        subtotal:
          2 * pricingConfig.qualifiedTechnicianNormalHours +
          2 * pricingConfig.labourerNormalHours,
      },
    ],
    total:
      2 * pricingConfig.masterQualifiedNormalHours +
      2 * pricingConfig.qualifiedTechnicianNormalHours +
      2 * pricingConfig.labourerNormalHours,
  };

  // After-hours (if emergency)
  if (isEmergency) {
    categories.afterHours = {
      name: "Labour — After-Hours or Weekend (Emergency)",
      lineItems: [
        {
          description: "Master Qualified Technician — Saturday rates",
          hours: 0, // To be filled by client
          rate: pricingConfig.masterQualifiedSaturday,
          subtotal: 0,
        },
        {
          description: "Qualified Technician — Saturday rates",
          hours: 0,
          rate: pricingConfig.qualifiedTechnicianSaturday,
          subtotal: 0,
        },
      ],
      total: 0,
    };
  }

  // Call-Out Fees
  categories.callOut = {
    name: "Call-Out Fees",
    lineItems: [
      {
        description: "Minimal Call-Out Fee",
        qty: 1,
        rate: pricingConfig.callOutFee,
        subtotal: pricingConfig.callOutFee,
      },
    ],
    total: pricingConfig.callOutFee,
  };

  // Equipment Rental - Use actual equipment selection data (only include if user selected)
  if (equipmentSelections.length > 0) {
    categories.equipment = {
      name: "Equipment Rental",
      lineItems: [],
      total: 0,
    };

    // Group equipment by type for better organization
    const lgrSelections = equipmentSelections.filter((sel: any) =>
      sel.groupId?.startsWith("lgr-"),
    );
    const desiccantSelections = equipmentSelections.filter((sel: any) =>
      sel.groupId?.startsWith("desiccant-"),
    );
    const airMoverSelections = equipmentSelections.filter((sel: any) =>
      sel.groupId?.startsWith("airmover-"),
    );
    const heatSelections = equipmentSelections.filter((sel: any) =>
      sel.groupId?.startsWith("heat-"),
    );
    const afdSelections = equipmentSelections.filter((sel: any) =>
      sel.groupId?.includes("afd"),
    );

    // Add LGR Dehumidifiers
    lgrSelections.forEach((sel: any) => {
      if (sel.quantity > 0) {
        const group = getEquipmentGroupById(sel.groupId);
        const dailyRate =
          sel.dailyRate || getEquipmentDailyRate(sel.groupId, pricingConfig);
        const itemTotal = dailyRate * sel.quantity * dryingDuration;
        categories.equipment.lineItems.push({
          description: group?.name || `LGR Dehumidifier (${sel.groupId})`,
          qty: sel.quantity,
          days: dryingDuration,
          dailyRate: dailyRate,
          subtotal: itemTotal,
        });
        categories.equipment.total += itemTotal;
      }
    });

    // Add Desiccant Dehumidifiers
    desiccantSelections.forEach((sel: any) => {
      if (sel.quantity > 0) {
        const group = getEquipmentGroupById(sel.groupId);
        const dailyRate =
          sel.dailyRate || getEquipmentDailyRate(sel.groupId, pricingConfig);
        const itemTotal = dailyRate * sel.quantity * dryingDuration;
        categories.equipment.lineItems.push({
          description: group?.name || `Desiccant Dehumidifier (${sel.groupId})`,
          qty: sel.quantity,
          days: dryingDuration,
          dailyRate: dailyRate,
          subtotal: itemTotal,
        });
        categories.equipment.total += itemTotal;
      }
    });

    // Add Air Movers
    airMoverSelections.forEach((sel: any) => {
      if (sel.quantity > 0) {
        const group = getEquipmentGroupById(sel.groupId);
        const dailyRate =
          sel.dailyRate || getEquipmentDailyRate(sel.groupId, pricingConfig);
        const itemTotal = dailyRate * sel.quantity * dryingDuration;
        categories.equipment.lineItems.push({
          description: group?.name || `Air Mover (${sel.groupId})`,
          qty: sel.quantity,
          days: dryingDuration,
          dailyRate: dailyRate,
          subtotal: itemTotal,
        });
        categories.equipment.total += itemTotal;
      }
    });

    // Add Heat Drying Systems
    heatSelections.forEach((sel: any) => {
      if (sel.quantity > 0) {
        const group = getEquipmentGroupById(sel.groupId);
        const dailyRate =
          sel.dailyRate || getEquipmentDailyRate(sel.groupId, pricingConfig);
        const itemTotal = dailyRate * sel.quantity * dryingDuration;
        categories.equipment.lineItems.push({
          description: group?.name || `Heat Drying System (${sel.groupId})`,
          qty: sel.quantity,
          days: dryingDuration,
          dailyRate: dailyRate,
          subtotal: itemTotal,
        });
        categories.equipment.total += itemTotal;
      }
    });

    // Add AFD Units
    afdSelections.forEach((sel: any) => {
      if (sel.quantity > 0) {
        const group = getEquipmentGroupById(sel.groupId);
        const dailyRate =
          sel.dailyRate || getEquipmentDailyRate(sel.groupId, pricingConfig);
        const itemTotal = dailyRate * sel.quantity * dryingDuration;
        categories.equipment.lineItems.push({
          description: group?.name || `AFD Unit (${sel.groupId})`,
          qty: sel.quantity,
          days: dryingDuration,
          dailyRate: dailyRate,
          subtotal: itemTotal,
        });
        categories.equipment.total += itemTotal;
      }
    });
  }

  // Equipment Rental - Extraction
  categories.extraction = {
    name: "Equipment Rental — Extraction",
    lineItems: [
      {
        description: "Truck-Mounted Extraction Unit",
        hours: 4,
        rate: pricingConfig.extractionTruckMountedHourlyRate,
        subtotal: 4 * pricingConfig.extractionTruckMountedHourlyRate,
      },
    ],
    total: 4 * pricingConfig.extractionTruckMountedHourlyRate,
  };

  // Equipment Rental - Drying Systems (if Class 4)
  if (needsClass4 && hasYellowTongue) {
    categories.dryingSystems = {
      name: "Equipment Rental — Drying Systems (Class 3/4)",
      lineItems: [
        {
          description:
            "Injection Drying System (thermal mats, injection equipment)",
          qty: 1,
          days: dryingDuration,
          dailyRate: pricingConfig.injectionDryingSystemDailyRate,
          subtotal:
            dryingDuration * pricingConfig.injectionDryingSystemDailyRate,
        },
      ],
      total: dryingDuration * pricingConfig.injectionDryingSystemDailyRate,
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
        rate: pricingConfig.thermalCameraUseCostPerAssessment,
        subtotal: 3 * pricingConfig.thermalCameraUseCostPerAssessment,
      },
    ],
    total: 3 * pricingConfig.thermalCameraUseCostPerAssessment,
  };

  // Chemical Treatment - Only include if user actually selected/needs it
  // Only add if affectedAreaSqm > 0 (user provided area) and hazards are present
  if (
    affectedAreaSqm > 0 &&
    (hasMould || hasBiohazard || tier3?.T3_Q3_chemicalTreatment)
  ) {
    categories.chemicalTreatment = {
      name: "Chemical Treatment",
      lineItems: [],
      total: 0,
    };

    // Standard antimicrobial treatment (if no specific hazard)
    if (!hasMould && !hasBiohazard && tier3?.T3_Q3_chemicalTreatment) {
      categories.chemicalTreatment.lineItems.push({
        description: "Anti-microbial Treatment",
        sqm: affectedAreaSqm,
        ratePerSqm: pricingConfig.antimicrobialTreatmentRate,
        subtotal: affectedAreaSqm * pricingConfig.antimicrobialTreatmentRate,
      });
      categories.chemicalTreatment.total +=
        affectedAreaSqm * pricingConfig.antimicrobialTreatmentRate;
    }

    // Mould remediation (only if mould hazard identified)
    if (hasMould) {
      categories.chemicalTreatment.lineItems.push({
        description: "Mould Remediation Treatment",
        sqm: affectedAreaSqm,
        ratePerSqm: pricingConfig.mouldRemediationTreatmentRate,
        subtotal: affectedAreaSqm * pricingConfig.mouldRemediationTreatmentRate,
      });
      categories.chemicalTreatment.total +=
        affectedAreaSqm * pricingConfig.mouldRemediationTreatmentRate;
    }

    // Biohazard treatment (only if biohazard identified)
    if (hasBiohazard) {
      categories.chemicalTreatment.lineItems.push({
        description: "Bio-Hazard Treatment",
        sqm: affectedAreaSqm,
        ratePerSqm: pricingConfig.biohazardTreatmentRate,
        subtotal: affectedAreaSqm * pricingConfig.biohazardTreatmentRate,
      });
      categories.chemicalTreatment.total +=
        affectedAreaSqm * pricingConfig.biohazardTreatmentRate;
    }
  }

  // Administration Fee
  categories.administration = {
    name: "Administration Fee",
    lineItems: [
      {
        description: "Claim Processing, Documentation, Report Generation",
        qty: 1,
        rate: pricingConfig.administrationFee,
        subtotal: pricingConfig.administrationFee,
      },
    ],
    total: pricingConfig.administrationFee,
  };

  // Calculate totals
  const totalLabour = Object.values(categories)
    .filter((c: any) => c.name.includes("Labour"))
    .reduce((sum: number, c: any) => sum + (c.total || 0), 0);

  const totalEquipment = Object.values(categories)
    .filter((c: any) => c.name.includes("Equipment"))
    .reduce((sum: number, c: any) => sum + (c.total || 0), 0);

  const totalChemicals = categories.chemicalTreatment?.total || 0;
  const totalAdmin = categories.administration?.total || 0;
  const totalCallOut = categories.callOut?.total || 0;
  const totalThermal = categories.thermalImaging?.total || 0;

  const subtotal =
    totalLabour +
    totalEquipment +
    totalChemicals +
    totalAdmin +
    totalCallOut +
    totalThermal;
  const gst = subtotal * gstTreatment.rate;
  const totalIncGST = subtotal + gst;

  // Industry comparison
  const industryAverage = { min: 6500, max: 12000 };
  const costAnalysis =
    subtotal < industryAverage.min
      ? "Below average (client may offer discount/aggressive pricing)"
      : subtotal > industryAverage.max
        ? "Above average (may warrant specialist services or complex claim justification)"
        : "Within range (market standard)";

  // Cost drivers
  const costDrivers = [];
  if (totalEquipment > totalLabour) {
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
    equipmentSelection,
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
      totalAdmin: totalAdmin + totalCallOut + totalThermal,
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
  };
}

// Build the complete cost estimation document server-side with exact values
