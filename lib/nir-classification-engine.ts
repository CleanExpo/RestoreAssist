/**
 * NIR Classification Engine
 * Implements IICRC S500 standards for water damage classification
 * 
 * Categories (Water Source):
 * - Category 1: Clean Water (potable water, broken pipes)
 * - Category 2: Grey Water (washing machine, dishwasher - contains contaminants)
 * - Category 3: Black Water (sewage, contaminated water)
 * - Category 4: Specialty Drying (brackish water, specialty protocols)
 * 
 * Classes (Affected Area Size):
 * - Class 1: <10% of floor space (evaporation adequate)
 * - Class 2: 10-50% of floor space (requires air movement + dehumidification)
 * - Class 3: >50% of floor space (requires aggressive drying)
 * - Class 4: Specialty Drying (concrete, hardwood, dense materials)
 */

interface ClassificationInput {
  waterSource: string
  affectedSquareFootage: number
  moistureReadings: Array<{
    surfaceType: string
    moistureLevel: number
    depth: string
  }>
  environmentalData: {
    ambientTemperature: number
    humidityLevel: number
    dewPoint: number
  }
  timeSinceLoss?: number | null
}

interface ClassificationResult {
  category: string
  class: string
  justification: string
  standardReference: string
  confidence: number
}

export async function classifyIICRC(input: ClassificationInput): Promise<ClassificationResult> {
  // Determine Category based on water source
  let category = "1"
  let categoryJustification = ""
  let categoryReference = "IICRC S500 Section 4"
  
  const waterSourceLower = input.waterSource.toLowerCase()
  
  if (waterSourceLower.includes("black") || waterSourceLower.includes("sewage") || waterSourceLower.includes("contaminated")) {
    category = "3"
    categoryJustification = "Water source is contaminated (sewage, black water). Requires containment and PPE per IICRC S500."
    categoryReference = "IICRC S500 Section 4.3"
  } else if (waterSourceLower.includes("grey") || waterSourceLower.includes("washing") || waterSourceLower.includes("dishwasher")) {
    category = "2"
    categoryJustification = "Water source contains contaminants but not fecal matter (grey water). Requires sanitization."
    categoryReference = "IICRC S500 Section 4.2"
  } else if (waterSourceLower.includes("clean") || waterSourceLower.includes("potable") || waterSourceLower.includes("pipe")) {
    category = "1"
    categoryJustification = "Water source is clean/potable water. No significant contamination."
    categoryReference = "IICRC S500 Section 4.1"
  } else {
    // Default to Category 2 if unclear
    category = "2"
    categoryJustification = "Water source classification unclear. Defaulting to Category 2 (grey water) for safety."
    categoryReference = "IICRC S500 Section 4.2"
  }
  
  // Determine Class based on affected area and moisture levels
  let classValue = "1"
  let classJustification = ""
  let classReference = "IICRC S500 Section 5"
  
  // Calculate average moisture level
  const avgMoisture = input.moistureReadings.length > 0
    ? input.moistureReadings.reduce((sum, r) => sum + r.moistureLevel, 0) / input.moistureReadings.length
    : 0
  
  // Check for specialty drying materials (Class 4)
  const specialtyMaterials = ["concrete", "hardwood", "dense", "brick", "stone"]
  const hasSpecialtyMaterial = input.moistureReadings.some(r =>
    specialtyMaterials.some(material => r.surfaceType.toLowerCase().includes(material))
  )
  
  if (hasSpecialtyMaterial && avgMoisture > 15) {
    classValue = "4"
    classJustification = `Specialty drying required. Affected materials include dense/specialty surfaces (${input.moistureReadings.find(r => specialtyMaterials.some(m => r.surfaceType.toLowerCase().includes(m)))?.surfaceType}). Average moisture: ${avgMoisture.toFixed(1)}%. Requires extended drying protocols.`
    classReference = "IICRC S500 Section 5.4"
  } else if (input.affectedSquareFootage > 0) {
    // Estimate total floor space (assume affected area is percentage of total)
    // For Class determination, we need percentage of total floor space
    // Since we don't have total floor space, we'll use moisture levels and area size as indicators
    
    // Class 3: Large area (>50% implied by high moisture and large area)
    if (input.affectedSquareFootage > 500 && avgMoisture > 20) {
      classValue = "3"
      classJustification = `Large affected area (${input.affectedSquareFootage.toFixed(0)} sq ft) with high moisture levels (avg ${avgMoisture.toFixed(1)}%). Requires aggressive drying with all equipment deployed.`
      classReference = "IICRC S500 Section 5.3"
    }
    // Class 2: Medium area (10-50%)
    else if (input.affectedSquareFootage > 100 || avgMoisture > 15) {
      classValue = "2"
      classJustification = `Moderate affected area (${input.affectedSquareFootage.toFixed(0)} sq ft) with moisture levels (avg ${avgMoisture.toFixed(1)}%). Requires air movement and dehumidification.`
      classReference = "IICRC S500 Section 5.2"
    }
    // Class 1: Small area (<10%)
    else {
      classValue = "1"
      classJustification = `Small affected area (${input.affectedSquareFootage.toFixed(0)} sq ft) with lower moisture levels (avg ${avgMoisture.toFixed(1)}%). Evaporation adequate, standard drying equipment.`
      classReference = "IICRC S500 Section 5.1"
    }
  }
  
  // Adjust category based on time since loss (Category 1 can degrade to Category 2)
  if (category === "1" && input.timeSinceLoss && input.timeSinceLoss > 48) {
    category = "2"
    categoryJustification += ` Note: Clean water has been standing for ${input.timeSinceLoss} hours, may have degraded to Category 2.`
  }
  
  // Calculate confidence (0-100)
  let confidence = 85 // Base confidence
  
  // Increase confidence if we have multiple moisture readings
  if (input.moistureReadings.length >= 3) {
    confidence += 5
  }
  
  // Increase confidence if environmental data is complete
  if (input.environmentalData && input.environmentalData.ambientTemperature && input.environmentalData.humidityLevel) {
    confidence += 5
  }
  
  // Decrease confidence if water source is unclear
  if (!waterSourceLower.includes("clean") && !waterSourceLower.includes("grey") && !waterSourceLower.includes("black")) {
    confidence -= 10
  }
  
  confidence = Math.min(100, Math.max(0, confidence))
  
  const justification = `${categoryJustification} ${classJustification}`
  const standardReference = `${categoryReference}; ${classReference}`
  
  return {
    category,
    class: classValue,
    justification: justification.trim(),
    standardReference,
    confidence
  }
}

