/**
 * Cost Calculator
 *
 * Comprehensive cost calculation functions that integrate with PricingStructure model.
 * Handles labour, equipment, chemicals, fees, GST, and industry benchmarking.
 */

import { PricingStructure } from '@prisma/client';

// ============================================================================
// Type Definitions
// ============================================================================

export interface LabourBreakdown {
  masterTechnician: {
    normalHours: number;
    afterHoursWeekday: number;
    saturday: number;
    sunday: number;
  };
  qualifiedTechnician: {
    normalHours: number;
    afterHoursWeekday: number;
    saturday: number;
    sunday: number;
  };
  labourer: {
    normalHours: number;
    afterHoursWeekday: number;
    saturday: number;
    sunday: number;
  };
}

export interface EquipmentBreakdown {
  dehumidifiers: {
    large: number; // days
    medium: number; // days
    desiccant: number; // days
  };
  airMovers: {
    axial: number; // days
    centrifugal: number; // days
    layflat: number; // days
  };
  afd: {
    extraLarge: number; // days
    large500cfm: number; // days
  };
  extraction: {
    truckMounted: number; // hours
    electric: number; // hours
  };
  thermalCamera: boolean;
}

export interface ChemicalBreakdown {
  antiMicrobial: number; // sqm
  mouldRemediation: number; // sqm
  bioHazard: number; // sqm
}

export interface FeeBreakdown {
  includeCallout: boolean;
  includeAdministration: boolean;
}

export interface ModifierBreakdown {
  waterClass?: 'Class1' | 'Class2' | 'Class3' | 'Class4';
  hazardLevel?: 'standard' | 'moderate' | 'high' | 'extreme';
  timelineExtension?: number; // percentage (e.g., 20 for 20% extension)
  complexityMultiplier?: number; // (e.g., 1.2 for 20% increase)
}

export interface LabourCostResult {
  masterTechnician: {
    normalHours: number;
    normalCost: number;
    afterHoursWeekday: number;
    afterHoursWeekdayCost: number;
    saturday: number;
    saturdayCost: number;
    sunday: number;
    sundayCost: number;
    totalHours: number;
    totalCost: number;
  };
  qualifiedTechnician: {
    normalHours: number;
    normalCost: number;
    afterHoursWeekday: number;
    afterHoursWeekdayCost: number;
    saturday: number;
    saturdayCost: number;
    sunday: number;
    sundayCost: number;
    totalHours: number;
    totalCost: number;
  };
  labourer: {
    normalHours: number;
    normalCost: number;
    afterHoursWeekday: number;
    afterHoursWeekdayCost: number;
    saturday: number;
    saturdayCost: number;
    sunday: number;
    sundayCost: number;
    totalHours: number;
    totalCost: number;
  };
  totalHours: number;
  totalCost: number;
  breakdown: string[];
}

export interface EquipmentCostResult {
  dehumidifiers: {
    large: { days: number; cost: number };
    medium: { days: number; cost: number };
    desiccant: { days: number; cost: number };
    totalDays: number;
    totalCost: number;
  };
  airMovers: {
    axial: { days: number; cost: number };
    centrifugal: { days: number; cost: number };
    layflat: { days: number; cost: number };
    totalDays: number;
    totalCost: number;
  };
  afd: {
    extraLarge: { days: number; cost: number };
    large500cfm: { days: number; cost: number };
    totalDays: number;
    totalCost: number;
  };
  extraction: {
    truckMounted: { hours: number; cost: number };
    electric: { hours: number; cost: number };
    totalHours: number;
    totalCost: number;
  };
  thermalCamera: {
    used: boolean;
    cost: number;
  };
  totalCost: number;
  breakdown: string[];
}

export interface ChemicalCostResult {
  antiMicrobial: {
    sqm: number;
    cost: number;
  };
  mouldRemediation: {
    sqm: number;
    cost: number;
  };
  bioHazard: {
    sqm: number;
    cost: number;
  };
  totalSqm: number;
  totalCost: number;
  breakdown: string[];
}

export interface FeeCostResult {
  calloutFee: number;
  administrationFee: number;
  totalFees: number;
  breakdown: string[];
}

export interface ModifierResult {
  waterClassAdjustment: number;
  hazardAdjustment: number;
  timelineAdjustment: number;
  complexityAdjustment: number;
  totalAdjustment: number;
  adjustmentPercentage: number;
  breakdown: string[];
}

export interface GSTResult {
  subtotal: number;
  gstRate: number;
  gst: number;
  total: number;
}

export interface IndustryBenchmark {
  category: string;
  yourCost: number;
  industryAverage: number;
  variance: number;
  variancePercentage: number;
  status: 'below' | 'within' | 'above';
}

export interface CostEstimationResult {
  labour: LabourCostResult;
  equipment: EquipmentCostResult;
  chemicals: ChemicalCostResult;
  fees: FeeCostResult;
  modifiers: ModifierResult;
  subtotal: number;
  adjustedSubtotal: number;
  gst: GSTResult;
  grandTotal: number;
  benchmarks: IndustryBenchmark[];
  summary: {
    totalHours: number;
    totalDays: number;
    costPerDay: number;
    costPerHour: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format currency for display
 */
function formatCurrency(amount: number, currency: string = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

/**
 * Round to 2 decimal places
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate percentage variance
 */
function calculateVariance(actual: number, benchmark: number): number {
  if (benchmark === 0) return 0;
  return round(((actual - benchmark) / benchmark) * 100);
}

/**
 * Get water class premium multiplier
 */
function getWaterClassMultiplier(waterClass?: string): number {
  switch (waterClass) {
    case 'Class1':
      return 1.0; // No adjustment
    case 'Class2':
      return 1.15; // 15% increase
    case 'Class3':
      return 1.35; // 35% increase
    case 'Class4':
      return 1.65; // 65% increase
    default:
      return 1.0;
  }
}

/**
 * Get hazard level cost escalation multiplier
 */
function getHazardMultiplier(hazardLevel?: string): number {
  switch (hazardLevel) {
    case 'standard':
      return 1.0; // No adjustment
    case 'moderate':
      return 1.1; // 10% increase
    case 'high':
      return 1.25; // 25% increase
    case 'extreme':
      return 1.5; // 50% increase
    default:
      return 1.0;
  }
}

// ============================================================================
// Core Calculation Functions
// ============================================================================

/**
 * Calculate labour costs with normal and after-hours rates
 */
export function calculateLabourCosts(
  labour: LabourBreakdown,
  pricing: PricingStructure
): LabourCostResult {
  const breakdown: string[] = [];

  // Master Technician
  const masterNormalCost = round(labour.masterTechnician.normalHours * pricing.masterTechnicianRate);
  const masterAfterHoursWeekdayCost = round(
    labour.masterTechnician.afterHoursWeekday * pricing.masterAfterHoursWeekday
  );
  const masterSaturdayCost = round(labour.masterTechnician.saturday * pricing.masterSaturday);
  const masterSundayCost = round(labour.masterTechnician.sunday * pricing.masterSunday);
  const masterTotalHours =
    labour.masterTechnician.normalHours +
    labour.masterTechnician.afterHoursWeekday +
    labour.masterTechnician.saturday +
    labour.masterTechnician.sunday;
  const masterTotalCost = round(
    masterNormalCost + masterAfterHoursWeekdayCost + masterSaturdayCost + masterSundayCost
  );

  if (masterTotalHours > 0) {
    breakdown.push(
      `Master Technician: ${masterTotalHours}hrs @ mixed rates = ${formatCurrency(masterTotalCost)}`
    );
  }

  // Qualified Technician
  const qualifiedNormalCost = round(
    labour.qualifiedTechnician.normalHours * pricing.qualifiedTechnicianRate
  );
  const qualifiedAfterHoursWeekdayCost = round(
    labour.qualifiedTechnician.afterHoursWeekday * pricing.qualifiedAfterHoursWeekday
  );
  const qualifiedSaturdayCost = round(
    labour.qualifiedTechnician.saturday * pricing.qualifiedSaturday
  );
  const qualifiedSundayCost = round(labour.qualifiedTechnician.sunday * pricing.qualifiedSunday);
  const qualifiedTotalHours =
    labour.qualifiedTechnician.normalHours +
    labour.qualifiedTechnician.afterHoursWeekday +
    labour.qualifiedTechnician.saturday +
    labour.qualifiedTechnician.sunday;
  const qualifiedTotalCost = round(
    qualifiedNormalCost +
      qualifiedAfterHoursWeekdayCost +
      qualifiedSaturdayCost +
      qualifiedSundayCost
  );

  if (qualifiedTotalHours > 0) {
    breakdown.push(
      `Qualified Technician: ${qualifiedTotalHours}hrs @ mixed rates = ${formatCurrency(
        qualifiedTotalCost
      )}`
    );
  }

  // Labourer
  const labourerNormalCost = round(labour.labourer.normalHours * pricing.labourerRate);
  const labourerAfterHoursWeekdayCost = round(
    labour.labourer.afterHoursWeekday * pricing.labourerAfterHoursWeekday
  );
  const labourerSaturdayCost = round(labour.labourer.saturday * pricing.labourerSaturday);
  const labourerSundayCost = round(labour.labourer.sunday * pricing.labourerSunday);
  const labourerTotalHours =
    labour.labourer.normalHours +
    labour.labourer.afterHoursWeekday +
    labour.labourer.saturday +
    labour.labourer.sunday;
  const labourerTotalCost = round(
    labourerNormalCost + labourerAfterHoursWeekdayCost + labourerSaturdayCost + labourerSundayCost
  );

  if (labourerTotalHours > 0) {
    breakdown.push(
      `Labourer: ${labourerTotalHours}hrs @ mixed rates = ${formatCurrency(labourerTotalCost)}`
    );
  }

  const totalHours = masterTotalHours + qualifiedTotalHours + labourerTotalHours;
  const totalCost = round(masterTotalCost + qualifiedTotalCost + labourerTotalCost);

  return {
    masterTechnician: {
      normalHours: labour.masterTechnician.normalHours,
      normalCost: masterNormalCost,
      afterHoursWeekday: labour.masterTechnician.afterHoursWeekday,
      afterHoursWeekdayCost: masterAfterHoursWeekdayCost,
      saturday: labour.masterTechnician.saturday,
      saturdayCost: masterSaturdayCost,
      sunday: labour.masterTechnician.sunday,
      sundayCost: masterSundayCost,
      totalHours: masterTotalHours,
      totalCost: masterTotalCost,
    },
    qualifiedTechnician: {
      normalHours: labour.qualifiedTechnician.normalHours,
      normalCost: qualifiedNormalCost,
      afterHoursWeekday: labour.qualifiedTechnician.afterHoursWeekday,
      afterHoursWeekdayCost: qualifiedAfterHoursWeekdayCost,
      saturday: labour.qualifiedTechnician.saturday,
      saturdayCost: qualifiedSaturdayCost,
      sunday: labour.qualifiedTechnician.sunday,
      sundayCost: qualifiedSundayCost,
      totalHours: qualifiedTotalHours,
      totalCost: qualifiedTotalCost,
    },
    labourer: {
      normalHours: labour.labourer.normalHours,
      normalCost: labourerNormalCost,
      afterHoursWeekday: labour.labourer.afterHoursWeekday,
      afterHoursWeekdayCost: labourerAfterHoursWeekdayCost,
      saturday: labour.labourer.saturday,
      saturdayCost: labourerSaturdayCost,
      sunday: labour.labourer.sunday,
      sundayCost: labourerSundayCost,
      totalHours: labourerTotalHours,
      totalCost: labourerTotalCost,
    },
    totalHours,
    totalCost,
    breakdown,
  };
}

/**
 * Calculate equipment costs based on daily rental rates
 */
export function calculateEquipmentCosts(
  equipment: EquipmentBreakdown,
  pricing: PricingStructure
): EquipmentCostResult {
  const breakdown: string[] = [];

  // Dehumidifiers
  const dehumLargeCost = round(equipment.dehumidifiers.large * pricing.dehumidifierLarge);
  const dehumMediumCost = round(equipment.dehumidifiers.medium * pricing.dehumidifierMedium);
  const dehumDesiccantCost = round(equipment.dehumidifiers.desiccant * pricing.dehumidifierDesiccant);
  const dehumTotalDays =
    equipment.dehumidifiers.large + equipment.dehumidifiers.medium + equipment.dehumidifiers.desiccant;
  const dehumTotalCost = round(dehumLargeCost + dehumMediumCost + dehumDesiccantCost);

  if (dehumTotalDays > 0) {
    breakdown.push(`Dehumidifiers: ${dehumTotalDays} unit-days = ${formatCurrency(dehumTotalCost)}`);
  }

  // Air Movers
  const airAxialCost = round(equipment.airMovers.axial * pricing.airmoverAxial);
  const airCentrifugalCost = round(equipment.airMovers.centrifugal * pricing.airmoverCentrifugal);
  const airLayflatCost = round(equipment.airMovers.layflat * pricing.airmoverLayflat);
  const airTotalDays =
    equipment.airMovers.axial + equipment.airMovers.centrifugal + equipment.airMovers.layflat;
  const airTotalCost = round(airAxialCost + airCentrifugalCost + airLayflatCost);

  if (airTotalDays > 0) {
    breakdown.push(`Air Movers: ${airTotalDays} unit-days = ${formatCurrency(airTotalCost)}`);
  }

  // AFD (Air Filtration Devices)
  const afdXLCost = round(equipment.afd.extraLarge * pricing.afdExtraLarge);
  const afd500Cost = round(equipment.afd.large500cfm * pricing.afdLarge500cfm);
  const afdTotalDays = equipment.afd.extraLarge + equipment.afd.large500cfm;
  const afdTotalCost = round(afdXLCost + afd500Cost);

  if (afdTotalDays > 0) {
    breakdown.push(`AFD Units: ${afdTotalDays} unit-days = ${formatCurrency(afdTotalCost)}`);
  }

  // Extraction Units (hourly)
  const extractTruckCost = round(equipment.extraction.truckMounted * pricing.extractionTruckMounted);
  const extractElectricCost = round(equipment.extraction.electric * pricing.extractionElectric);
  const extractTotalHours = equipment.extraction.truckMounted + equipment.extraction.electric;
  const extractTotalCost = round(extractTruckCost + extractElectricCost);

  if (extractTotalHours > 0) {
    breakdown.push(`Extraction: ${extractTotalHours}hrs = ${formatCurrency(extractTotalCost)}`);
  }

  // Thermal Camera
  const thermalCost = equipment.thermalCamera ? pricing.thermalCameraClaimCost : 0;

  if (thermalCost > 0) {
    breakdown.push(`Thermal Camera: ${formatCurrency(thermalCost)}`);
  }

  const totalCost = round(
    dehumTotalCost + airTotalCost + afdTotalCost + extractTotalCost + thermalCost
  );

  return {
    dehumidifiers: {
      large: { days: equipment.dehumidifiers.large, cost: dehumLargeCost },
      medium: { days: equipment.dehumidifiers.medium, cost: dehumMediumCost },
      desiccant: { days: equipment.dehumidifiers.desiccant, cost: dehumDesiccantCost },
      totalDays: dehumTotalDays,
      totalCost: dehumTotalCost,
    },
    airMovers: {
      axial: { days: equipment.airMovers.axial, cost: airAxialCost },
      centrifugal: { days: equipment.airMovers.centrifugal, cost: airCentrifugalCost },
      layflat: { days: equipment.airMovers.layflat, cost: airLayflatCost },
      totalDays: airTotalDays,
      totalCost: airTotalCost,
    },
    afd: {
      extraLarge: { days: equipment.afd.extraLarge, cost: afdXLCost },
      large500cfm: { days: equipment.afd.large500cfm, cost: afd500Cost },
      totalDays: afdTotalDays,
      totalCost: afdTotalCost,
    },
    extraction: {
      truckMounted: { hours: equipment.extraction.truckMounted, cost: extractTruckCost },
      electric: { hours: equipment.extraction.electric, cost: extractElectricCost },
      totalHours: extractTotalHours,
      totalCost: extractTotalCost,
    },
    thermalCamera: {
      used: equipment.thermalCamera,
      cost: thermalCost,
    },
    totalCost,
    breakdown,
  };
}

/**
 * Calculate chemical application costs per square meter
 */
export function calculateChemicalCosts(
  chemicals: ChemicalBreakdown,
  pricing: PricingStructure
): ChemicalCostResult {
  const breakdown: string[] = [];

  // Anti-Microbial
  const antiMicrobialCost = round(chemicals.antiMicrobial * pricing.chemicalAntiMicrobial);
  if (chemicals.antiMicrobial > 0) {
    breakdown.push(
      `Anti-Microbial: ${chemicals.antiMicrobial}sqm @ ${formatCurrency(
        pricing.chemicalAntiMicrobial
      )}/sqm = ${formatCurrency(antiMicrobialCost)}`
    );
  }

  // Mould Remediation
  const mouldCost = round(chemicals.mouldRemediation * pricing.chemicalMouldRemediation);
  if (chemicals.mouldRemediation > 0) {
    breakdown.push(
      `Mould Remediation: ${chemicals.mouldRemediation}sqm @ ${formatCurrency(
        pricing.chemicalMouldRemediation
      )}/sqm = ${formatCurrency(mouldCost)}`
    );
  }

  // Bio-Hazard
  const bioHazardCost = round(chemicals.bioHazard * pricing.chemicalBioHazard);
  if (chemicals.bioHazard > 0) {
    breakdown.push(
      `Bio-Hazard: ${chemicals.bioHazard}sqm @ ${formatCurrency(
        pricing.chemicalBioHazard
      )}/sqm = ${formatCurrency(bioHazardCost)}`
    );
  }

  const totalSqm = chemicals.antiMicrobial + chemicals.mouldRemediation + chemicals.bioHazard;
  const totalCost = round(antiMicrobialCost + mouldCost + bioHazardCost);

  return {
    antiMicrobial: {
      sqm: chemicals.antiMicrobial,
      cost: antiMicrobialCost,
    },
    mouldRemediation: {
      sqm: chemicals.mouldRemediation,
      cost: mouldCost,
    },
    bioHazard: {
      sqm: chemicals.bioHazard,
      cost: bioHazardCost,
    },
    totalSqm,
    totalCost,
    breakdown,
  };
}

/**
 * Calculate fees (callout and administration)
 */
export function calculateFees(fees: FeeBreakdown, pricing: PricingStructure): FeeCostResult {
  const breakdown: string[] = [];

  const calloutFee = fees.includeCallout ? pricing.minimalCalloutFee : 0;
  const administrationFee = fees.includeAdministration ? pricing.administrationFee : 0;

  if (calloutFee > 0) {
    breakdown.push(`Callout Fee: ${formatCurrency(calloutFee)}`);
  }

  if (administrationFee > 0) {
    breakdown.push(`Administration Fee: ${formatCurrency(administrationFee)}`);
  }

  const totalFees = round(calloutFee + administrationFee);

  return {
    calloutFee,
    administrationFee,
    totalFees,
    breakdown,
  };
}

/**
 * Calculate modifiers and adjustments
 */
export function calculateModifiers(
  subtotal: number,
  modifiers?: ModifierBreakdown
): ModifierResult {
  const breakdown: string[] = [];
  let totalAdjustment = 0;

  // Water Class Adjustment
  const waterClassMultiplier = getWaterClassMultiplier(modifiers?.waterClass);
  const waterClassAdjustment =
    waterClassMultiplier !== 1.0 ? round(subtotal * (waterClassMultiplier - 1)) : 0;
  if (waterClassAdjustment !== 0) {
    breakdown.push(
      `Water Class ${modifiers?.waterClass}: ${round(
        (waterClassMultiplier - 1) * 100
      )}% = ${formatCurrency(waterClassAdjustment)}`
    );
    totalAdjustment += waterClassAdjustment;
  }

  // Hazard Level Adjustment
  const hazardMultiplier = getHazardMultiplier(modifiers?.hazardLevel);
  const hazardAdjustment =
    hazardMultiplier !== 1.0 ? round(subtotal * (hazardMultiplier - 1)) : 0;
  if (hazardAdjustment !== 0) {
    breakdown.push(
      `Hazard Level (${modifiers?.hazardLevel}): ${round(
        (hazardMultiplier - 1) * 100
      )}% = ${formatCurrency(hazardAdjustment)}`
    );
    totalAdjustment += hazardAdjustment;
  }

  // Timeline Extension Adjustment
  const timelineAdjustment = modifiers?.timelineExtension
    ? round(subtotal * (modifiers.timelineExtension / 100))
    : 0;
  if (timelineAdjustment !== 0) {
    breakdown.push(
      `Timeline Extension: ${modifiers?.timelineExtension}% = ${formatCurrency(timelineAdjustment)}`
    );
    totalAdjustment += timelineAdjustment;
  }

  // Complexity Multiplier Adjustment
  const complexityMultiplier = modifiers?.complexityMultiplier ?? 1.0;
  const complexityAdjustment =
    complexityMultiplier !== 1.0 ? round(subtotal * (complexityMultiplier - 1)) : 0;
  if (complexityAdjustment !== 0) {
    breakdown.push(
      `Complexity Multiplier: ${round(
        (complexityMultiplier - 1) * 100
      )}% = ${formatCurrency(complexityAdjustment)}`
    );
    totalAdjustment += complexityAdjustment;
  }

  totalAdjustment = round(totalAdjustment);
  const adjustmentPercentage = subtotal > 0 ? round((totalAdjustment / subtotal) * 100) : 0;

  return {
    waterClassAdjustment,
    hazardAdjustment,
    timelineAdjustment,
    complexityAdjustment,
    totalAdjustment,
    adjustmentPercentage,
    breakdown,
  };
}

/**
 * Calculate GST
 */
export function calculateGST(subtotal: number, taxRate: number): GSTResult {
  const gst = round(subtotal * taxRate);
  const total = round(subtotal + gst);

  return {
    subtotal,
    gstRate: taxRate,
    gst,
    total,
  };
}

/**
 * Generate industry benchmarks (placeholder data - replace with real benchmarks)
 */
export function generateBenchmarks(result: CostEstimationResult): IndustryBenchmark[] {
  // Industry averages (placeholder - should be configurable)
  const industryAverages = {
    labourPerHour: 85,
    equipmentPerDay: 120,
    chemicalPerSqm: 2.0,
  };

  const benchmarks: IndustryBenchmark[] = [];

  // Labour benchmark
  if (result.labour.totalHours > 0) {
    const yourLabourPerHour = round(result.labour.totalCost / result.labour.totalHours);
    const labourVariance = round(yourLabourPerHour - industryAverages.labourPerHour);
    const labourVariancePercentage = calculateVariance(
      yourLabourPerHour,
      industryAverages.labourPerHour
    );

    benchmarks.push({
      category: 'Labour (per hour)',
      yourCost: yourLabourPerHour,
      industryAverage: industryAverages.labourPerHour,
      variance: labourVariance,
      variancePercentage: labourVariancePercentage,
      status:
        labourVariancePercentage < -10
          ? 'below'
          : labourVariancePercentage > 10
          ? 'above'
          : 'within',
    });
  }

  // Equipment benchmark
  const equipmentDays =
    result.equipment.dehumidifiers.totalDays +
    result.equipment.airMovers.totalDays +
    result.equipment.afd.totalDays;

  if (equipmentDays > 0) {
    const yourEquipmentPerDay = round(result.equipment.totalCost / equipmentDays);
    const equipmentVariance = round(yourEquipmentPerDay - industryAverages.equipmentPerDay);
    const equipmentVariancePercentage = calculateVariance(
      yourEquipmentPerDay,
      industryAverages.equipmentPerDay
    );

    benchmarks.push({
      category: 'Equipment (per day)',
      yourCost: yourEquipmentPerDay,
      industryAverage: industryAverages.equipmentPerDay,
      variance: equipmentVariance,
      variancePercentage: equipmentVariancePercentage,
      status:
        equipmentVariancePercentage < -10
          ? 'below'
          : equipmentVariancePercentage > 10
          ? 'above'
          : 'within',
    });
  }

  // Chemical benchmark
  if (result.chemicals.totalSqm > 0) {
    const yourChemicalPerSqm = round(result.chemicals.totalCost / result.chemicals.totalSqm);
    const chemicalVariance = round(yourChemicalPerSqm - industryAverages.chemicalPerSqm);
    const chemicalVariancePercentage = calculateVariance(
      yourChemicalPerSqm,
      industryAverages.chemicalPerSqm
    );

    benchmarks.push({
      category: 'Chemicals (per sqm)',
      yourCost: yourChemicalPerSqm,
      industryAverage: industryAverages.chemicalPerSqm,
      variance: chemicalVariance,
      variancePercentage: chemicalVariancePercentage,
      status:
        chemicalVariancePercentage < -10
          ? 'below'
          : chemicalVariancePercentage > 10
          ? 'above'
          : 'within',
    });
  }

  return benchmarks;
}

// ============================================================================
// Main Estimation Function
// ============================================================================

/**
 * Main cost calculation function
 *
 * Integrates all cost components and produces comprehensive estimation result
 */
export function calculateEstimation(input: {
  pricingStructure: PricingStructure;
  labour: LabourBreakdown;
  equipment: EquipmentBreakdown;
  chemicals: ChemicalBreakdown;
  fees: FeeBreakdown;
  modifiers?: ModifierBreakdown;
}): CostEstimationResult {
  const { pricingStructure, labour, equipment, chemicals, fees, modifiers } = input;

  // Calculate individual components
  const labourResult = calculateLabourCosts(labour, pricingStructure);
  const equipmentResult = calculateEquipmentCosts(equipment, pricingStructure);
  const chemicalResult = calculateChemicalCosts(chemicals, pricingStructure);
  const feeResult = calculateFees(fees, pricingStructure);

  // Calculate subtotal (before modifiers)
  const subtotal = round(
    labourResult.totalCost +
      equipmentResult.totalCost +
      chemicalResult.totalCost +
      feeResult.totalFees
  );

  // Apply modifiers
  const modifierResult = calculateModifiers(subtotal, modifiers);
  const adjustedSubtotal = round(subtotal + modifierResult.totalAdjustment);

  // Calculate GST
  const gstResult = calculateGST(adjustedSubtotal, pricingStructure.taxRate);

  // Calculate summary metrics
  const equipmentDays =
    equipmentResult.dehumidifiers.totalDays +
    equipmentResult.airMovers.totalDays +
    equipmentResult.afd.totalDays;

  const totalDays = equipmentDays > 0 ? equipmentDays : 1;
  const costPerDay = round(gstResult.total / totalDays);
  const costPerHour = labourResult.totalHours > 0 ? round(gstResult.total / labourResult.totalHours) : 0;

  const result: CostEstimationResult = {
    labour: labourResult,
    equipment: equipmentResult,
    chemicals: chemicalResult,
    fees: feeResult,
    modifiers: modifierResult,
    subtotal,
    adjustedSubtotal,
    gst: gstResult,
    grandTotal: gstResult.total,
    benchmarks: [],
    summary: {
      totalHours: labourResult.totalHours,
      totalDays,
      costPerDay,
      costPerHour,
    },
  };

  // Generate benchmarks
  result.benchmarks = generateBenchmarks(result);

  return result;
}

// ============================================================================
// Export Utilities
// ============================================================================

export {
  formatCurrency,
  round,
  calculateVariance,
  getWaterClassMultiplier,
  getHazardMultiplier,
};
