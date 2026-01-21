// Psychrometric calculations for drying potential assessment

export interface PsychrometricData {
  waterClass: 1 | 2 | 3 | 4
  temperature: number // Celsius
  humidity: number // Percentage (0-100)
  systemType?: 'open' | 'closed' // Ventilation system type
}

export interface DryingPotentialResult {
  dryingIndex: number
  status: 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT'
  recommendation: string
  vaporPressureDifferential: number
}

/**
 * Calculate Grains Per Pound (GPP) of moisture in air
 * IICRC S500 standard measurement for moisture content
 * Formula: GPP = (RH/100) * (7000 / (7000 - RH)) * (0.622 * Pws / (P - Pws))
 * Simplified for practical use: GPP ≈ (RH/100) * (7000 / (7000 - RH)) * (0.622 * Pws / (P - Pws))
 */
function calculateGPP(temperature: number, humidity: number): number {
  // Atmospheric pressure at sea level (kPa) - adjust for altitude if needed
  const P = 101.325 // kPa
  
  // Saturation vapor pressure using Magnus formula (IICRC standard)
  // Pws in kPa = 0.611 * exp((17.27 * T) / (T + 237.3))
  const Pws = 0.611 * Math.exp((17.27 * temperature) / (temperature + 237.3))
  
  // Actual vapor pressure
  const Pw = Pws * (humidity / 100)
  
  // Grains Per Pound calculation (simplified IICRC formula)
  // 1 grain = 1/7000 pound
  // GPP = 7000 * (Pw / (P - Pw)) * (0.622 / 0.378)
  const GPP = 7000 * (Pw / (P - Pw)) * (0.622 / 0.378)
  
  return GPP
}

/**
 * Calculate drying potential (Drying Index) according to IICRC S500 standards
 * Based on psychrometric principles: vapor pressure differential and GPP gradient
 */
export function calculateDryingPotential(data: PsychrometricData): DryingPotentialResult {
  const { temperature, humidity, waterClass, systemType = 'closed' } = data
  
  // IICRC S500 Target Conditions by Water Class
  // These represent optimal drying conditions for each class
  const targetConditions: Record<1 | 2 | 3 | 4, { temp: number; rh: number }> = {
    1: { temp: 22, rh: 45 },  // Class 1: Moderate conditions
    2: { temp: 25, rh: 35 },  // Class 2: Standard conditions
    3: { temp: 28, rh: 30 },  // Class 3: Aggressive conditions
    4: { temp: 32, rh: 25 }   // Class 4: Maximum conditions
  }
  
  const target = targetConditions[waterClass]
  
  // Calculate current GPP
  const currentGPP = calculateGPP(temperature, humidity)
  
  // Calculate target GPP (optimal conditions)
  const targetGPP = calculateGPP(target.temp, target.rh)
  
  // GPP Differential (negative = good drying, positive = poor)
  // Lower GPP in air = better drying potential
  const gppDifferential = currentGPP - targetGPP
  
  // Calculate vapor pressure using Magnus formula (IICRC standard)
  // Saturation vapor pressure at given temperature (in kPa)
  const saturationVaporPressure = 0.611 * Math.exp((17.27 * temperature) / (temperature + 237.3))
  
  // Actual vapor pressure
  const actualVaporPressure = saturationVaporPressure * (humidity / 100)
  
  // Vapor pressure differential (driving force for evaporation)
  // This is the key metric: difference between saturation and actual vapor pressure
  const vaporPressureDifferential = saturationVaporPressure - actualVaporPressure
  
  // Target vapor pressure differential (optimal conditions)
  const targetSaturationVP = 0.611 * Math.exp((17.27 * target.temp) / (target.temp + 237.3))
  const targetActualVP = targetSaturationVP * (target.rh / 100)
  const targetVPDifferential = targetSaturationVP - targetActualVP
  
  // Calculate how close current conditions are to optimal
  // Factor 1: Temperature proximity to target (0-1 scale)
  const tempRange = { min: target.temp - 5, max: target.temp + 5 }
  const tempProximity = temperature >= tempRange.min && temperature <= tempRange.max
    ? 1 - Math.abs(temperature - target.temp) / 5
    : Math.max(0, 1 - Math.abs(temperature - target.temp) / 15)
  
  // Factor 2: Humidity proximity to target (lower is better for drying)
  const rhRange = { min: target.rh - 10, max: target.rh + 10 }
  const rhProximity = humidity >= rhRange.min && humidity <= rhRange.max
    ? 1 - Math.abs(humidity - target.rh) / 10
    : humidity < target.rh
    ? Math.min(1, 1 + (target.rh - humidity) / 20) // Lower RH is better
    : Math.max(0, 1 - (humidity - target.rh) / 30) // Higher RH is worse
  
  // Factor 3: Vapor pressure differential (current vs target)
  const vpdRatio = vaporPressureDifferential > 0
    ? Math.min(1, vaporPressureDifferential / targetVPDifferential)
    : 0
  
  // Factor 4: System type adjustment
  // Closed systems have better control and higher drying potential
  const systemFactor = systemType === 'closed' ? 1.0 : 0.85
  
  // Factor 5: GPP differential (negative = good, positive = bad)
  // Normalize: -50 to +50 GPP range maps to 0-1 scale
  const gppFactor = Math.max(0, Math.min(1, 1 - (gppDifferential + 20) / 40))
  
  // Calculate Drying Index (0-100 scale)
  // Weighted combination of all factors
  const dryingIndex = Math.min(100, Math.max(0,
    (tempProximity * 25) +           // 25% weight on temperature
    (rhProximity * 30) +              // 30% weight on humidity
    (vpdRatio * 30) +                 // 30% weight on vapor pressure differential
    (gppFactor * 15) * systemFactor   // 15% weight on GPP, adjusted by system type
  ))
  
  // Determine status based on IICRC S500 guidelines
  let status: 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT'
  let recommendation: string
  
  if (dryingIndex < 30) {
    status = 'POOR'
    recommendation = `Conditions unfavorable for drying. Current: ${temperature}°C, ${humidity}% RH. Target for Class ${waterClass}: ${target.temp}°C, ${target.rh}% RH. Action: Increase temperature to ${target.temp}°C and reduce humidity to ${target.rh}% RH using dehumidification.`
  } else if (dryingIndex < 50) {
    status = 'FAIR'
    recommendation = `Suboptimal drying conditions. Current: ${temperature}°C, ${humidity}% RH. Target for Class ${waterClass}: ${target.temp}°C, ${target.rh}% RH. Action: Adjust temperature and humidity closer to target conditions. Add air movement to enhance evaporation.`
  } else if (dryingIndex < 80) {
    status = 'GOOD'
    recommendation = `Good drying conditions. Current: ${temperature}°C, ${humidity}% RH. Target for Class ${waterClass}: ${target.temp}°C, ${target.rh}% RH. Action: Maintain current conditions. Monitor psychrometric readings regularly.`
  } else {
    status = 'EXCELLENT'
    recommendation = `Excellent drying conditions. Current: ${temperature}°C, ${humidity}% RH. Target for Class ${waterClass}: ${target.temp}°C, ${target.rh}% RH. Action: Conditions are optimal. Monitor for over-drying and adjust equipment as needed.`
  }
  
  return {
    dryingIndex: Math.round(dryingIndex * 10) / 10,
    status,
    recommendation,
    vaporPressureDifferential: Math.round(vaporPressureDifferential * 100) / 100
  }
}

// Calculate water removal target (Liters/Day) based on IICRC S500
export function calculateWaterRemovalTarget(
  totalVolume: number, // m³
  waterClass: 1 | 2 | 3 | 4,
  affectedArea: number // m²
): number {
  /**
   * IICRC S500-aligned rule-of-thumb:
   * Dehumidification demand scales primarily with the *affected wet surface area* and class,
   * not the full room air volume. Using totalVolume tends to massively over-allocate DH units.
   *
   * Note: This is a planning target for L/Day capacity (AHAM-style ratings). Field conditions
   * and psychrometrics can change the real-world requirement.
   */
  const litresPerM2PerDayByClass: Record<1 | 2 | 3 | 4, number> = {
    1: 4,  // minimal water load
    2: 8,  // typical Class 2
    3: 12, // heavy water load
    4: 16  // bound water / deep saturation
  }

  const affectedAreaTarget = Math.max(0, affectedArea) * (litresPerM2PerDayByClass[waterClass] || 8)

  // Fallback (legacy): if affected area is unavailable, use a conservative volume-based estimate.
  if (!isFinite(affectedAreaTarget) || affectedAreaTarget <= 0) {
    const classFactors: Record<1 | 2 | 3 | 4, number> = {
      1: 0.5,
      2: 1.0,
      3: 1.5,
      4: 2.0
    }
  const classFactor = classFactors[waterClass] || 1.0
    const baseRate = Math.max(0, totalVolume) * 0.01 // 1% per day base
    return Math.round(baseRate * classFactor * 1000)
  }

  return Math.round(affectedAreaTarget)
}

// Calculate air movers required based on affected area
// IICRC S500: 1 air mover per 10-15 m² for Class 2
export function calculateAirMoversRequired(
  affectedArea: number, // m²
  waterClass: 1 | 2 | 3 | 4
): number {
  const areaPerMover = {
    1: 20, // m² per mover
    2: 15,
    3: 10,
    4: 8
  }
  
  const areaPerUnit = areaPerMover[waterClass] || 15
  return Math.ceil(affectedArea / areaPerUnit)
}

// Calculate AFD (air filtration device / HEPA air scrubber) units for containment/filtration scenarios.
// Rule-of-thumb: 1 unit per ~50m² when required (mould / Category 2+ / demolition dust), minimum 1.
export function calculateAFDUnitsRequired(
  affectedArea: number, // m²
  requiresAFD: boolean
): number {
  if (!requiresAFD) return 0
  const area = Math.max(0, affectedArea)
  return Math.max(1, Math.ceil(area / 50))
}

// Calculate total volume from scope areas
export function calculateTotalVolume(areas: Array<{
  length: number
  width: number
  height: number
  wetPercentage: number
}>): { totalVolume: number; totalAffectedArea: number } {
  let totalVolume = 0
  let totalAffectedArea = 0
  
  areas.forEach(area => {
    const volume = area.length * area.width * area.height
    const affectedArea = area.length * area.width * (area.wetPercentage / 100)
    
    totalVolume += volume
    totalAffectedArea += affectedArea
  })
  
  return {
    totalVolume: Math.round(totalVolume * 10) / 10,
    totalAffectedArea: Math.round(totalAffectedArea * 10) / 10
  }
}

