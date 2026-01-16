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

// Calculate drying potential (Drying Index)
// Based on psychrometric principles and IICRC S500 standards
export function calculateDryingPotential(data: PsychrometricData): DryingPotentialResult {
  const { temperature, humidity, waterClass } = data
  
  // Calculate vapor pressure using Magnus formula approximation
  // Saturation vapor pressure at given temperature
  const saturationVaporPressure = 6.112 * Math.exp((17.67 * temperature) / (temperature + 243.5))
  
  // Actual vapor pressure
  const actualVaporPressure = saturationVaporPressure * (humidity / 100)
  
  // Vapor pressure differential (driving force for evaporation)
  // Higher differential = better drying potential
  const vaporPressureDifferential = saturationVaporPressure - actualVaporPressure
  
  // Drying Index calculation
  // Factors: temperature, humidity, and water class
  // Formula: (Temperature factor * Humidity factor * Class factor)
  const tempFactor = Math.max(0, (temperature - 5) / 30) // Normalize temp (5-35°C range)
  const humidityFactor = (100 - humidity) / 100 // Inverse humidity
  const classFactor = 1 + (waterClass - 1) * 0.2 // Class 1 = 1.0, Class 4 = 1.6
  
  // Drying Index (0-100 scale)
  const dryingIndex = Math.min(100, Math.max(0, 
    (tempFactor * humidityFactor * classFactor * 80) + 
    (vaporPressureDifferential / saturationVaporPressure * 20)
  ))
  
  // Determine status
  let status: 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT'
  let recommendation: string
  
  if (dryingIndex < 30) {
    status = 'POOR'
    recommendation = 'Air saturated or cold. Minimal evaporation. Action: Increase heat or dehumidification.'
  } else if (dryingIndex < 50) {
    status = 'FAIR'
    recommendation = 'Slow evaporation. Action: Add air movement and monitor closely.'
  } else if (dryingIndex < 80) {
    status = 'GOOD'
    recommendation = 'Optimal range. Action: Maintain current setup.'
  } else {
    status = 'EXCELLENT'
    recommendation = 'Rapid evaporation. Action: Watch for over-drying.'
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

