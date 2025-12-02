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
  // Base calculation: Volume * Class factor * Evaporation rate
  const classFactors = {
    1: 0.5,  // Least water
    2: 1.0,  // Significant water
    3: 1.5,  // Greatest amount of water
    4: 2.0   // Bound water/Deep saturation
  }
  
  const classFactor = classFactors[waterClass] || 1.0
  
  // Estimate: 1-2% of volume per day for Class 2, scaled by class
  const baseRate = totalVolume * 0.01 // 1% per day base
  const adjustedRate = baseRate * classFactor
  
  // Convert m³ to liters (1 m³ = 1000 L)
  return Math.round(adjustedRate * 1000)
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

