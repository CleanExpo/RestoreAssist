/**
 * NIR Building Code Lookup System
 * Provides state-specific building code requirements for Australian states
 * Based on National Construction Code (NCC) and state-specific regulations
 */

import { detectStateFromPostcode } from "@/lib/state-detection"

export interface BuildingCodeRequirements {
  state: string
  codeVersion: string
  moistureThreshold: number | null
  dryingTimeStandard: string | null
  dehumidificationRequired: boolean
  certificationRequired: boolean
  requirements: {
    [key: string]: any
  }
  notes: string | null
}

/**
 * Get building code requirements for a given postcode
 */
export async function getBuildingCodeRequirements(
  postcode: string
): Promise<BuildingCodeRequirements | null> {
  try {
    // Detect state from postcode
    const state = detectStateFromPostcode(postcode)
    
    if (!state) {
      return null
    }
    
    // Get requirements from database or return defaults
    // For now, we'll use a lookup function, but this should query the BuildingCode table
    return getStateBuildingCodeRequirements(state, postcode)
  } catch (error) {
    console.error("Error getting building code requirements:", error)
    return null
  }
}

/**
 * Get state-specific building code requirements
 */
function getStateBuildingCodeRequirements(
  state: string,
  postcode?: string
): BuildingCodeRequirements {
  const stateUpper = state.toUpperCase()
  
  // Base requirements structure
  const baseRequirements: BuildingCodeRequirements = {
    state: stateUpper,
    codeVersion: "NCC 2022",
    moistureThreshold: 20, // Default threshold
    dryingTimeStandard: "48-72 hours",
    dehumidificationRequired: false,
    certificationRequired: false,
    requirements: {},
    notes: null
  }
  
  // State-specific requirements
  switch (stateUpper) {
    case "QLD":
      return {
        ...baseRequirements,
        codeVersion: "NCC 2022 (QLD Building Act 1975)",
        moistureThreshold: 20,
        dryingTimeStandard: "48-72 hours",
        dehumidificationRequired: true, // QLD requires dehumidification if moisture > 20%
        certificationRequired: false,
        requirements: {
          moistureThreshold: 20,
          dehumidificationRequired: "If moisture > 20% AND drywall affected, dehumidification is mandatory",
          dryingAssessment: "48-72hr drying assessment required",
          moldTesting: "If > 3 days damp: requires mold testing",
          asbestos: "Pre-1990 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required"
        },
        notes: "Queensland Building and Construction Commission (QBCC) requirements apply. Pre-1990 buildings require asbestos assessment."
      }
      
    case "NSW":
      return {
        ...baseRequirements,
        codeVersion: "NCC 2022 (NSW Environmental Planning and Assessment Act 1979)",
        moistureThreshold: 18,
        dryingTimeStandard: "48-72 hours",
        dehumidificationRequired: true,
        certificationRequired: false,
        requirements: {
          moistureThreshold: 18,
          dehumidificationRequired: "If moisture > 18% AND structural materials affected",
          dryingAssessment: "48-72hr drying assessment required",
          moldTesting: "If visible mold or > 3 days damp: requires mold testing",
          asbestos: "Pre-1987 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required"
        },
        notes: "NSW Fair Trading requirements apply. Pre-1987 buildings require asbestos assessment."
      }
      
    case "VIC":
      return {
        ...baseRequirements,
        codeVersion: "NCC 2022 (Victorian Building Act 1993)",
        moistureThreshold: 20,
        dryingTimeStandard: "48-72 hours",
        dehumidificationRequired: true,
        certificationRequired: false,
        requirements: {
          moistureThreshold: 20,
          dehumidificationRequired: "If moisture > 20% AND drywall/structural materials affected",
          dryingAssessment: "48-72hr drying assessment required",
          moldTesting: "If visible mold or > 3 days damp: requires mold testing",
          asbestos: "Pre-1990 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required"
        },
        notes: "Victorian Building Authority (VBA) requirements apply. Pre-1990 buildings require asbestos assessment."
      }
      
    case "WA":
      return {
        ...baseRequirements,
        codeVersion: "NCC 2022 (WA Building Act 2011)",
        moistureThreshold: 20,
        dryingTimeStandard: "48-72 hours",
        dehumidificationRequired: true,
        certificationRequired: false,
        requirements: {
          moistureThreshold: 20,
          dehumidificationRequired: "If moisture > 20% AND structural materials affected",
          dryingAssessment: "48-72hr drying assessment required",
          moldTesting: "If visible mold or > 3 days damp: requires mold testing",
          asbestos: "Pre-1990 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required"
        },
        notes: "Western Australian Building Commission requirements apply."
      }
      
    case "SA":
      return {
        ...baseRequirements,
        codeVersion: "NCC 2022 (SA Development Act 1993)",
        moistureThreshold: 20,
        dryingTimeStandard: "48-72 hours",
        dehumidificationRequired: true,
        certificationRequired: false,
        requirements: {
          moistureThreshold: 20,
          dehumidificationRequired: "If moisture > 20% AND structural materials affected",
          dryingAssessment: "48-72hr drying assessment required",
          moldTesting: "If visible mold or > 3 days damp: requires mold testing",
          asbestos: "Pre-1990 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required"
        },
        notes: "South Australian Building Commission requirements apply."
      }
      
    case "TAS":
      return {
        ...baseRequirements,
        codeVersion: "NCC 2022 (TAS Building Act 2016)",
        moistureThreshold: 20,
        dryingTimeStandard: "48-72 hours",
        dehumidificationRequired: true,
        certificationRequired: false,
        requirements: {
          moistureThreshold: 20,
          dehumidificationRequired: "If moisture > 20% AND structural materials affected",
          dryingAssessment: "48-72hr drying assessment required",
          moldTesting: "If visible mold or > 3 days damp: requires mold testing",
          asbestos: "Pre-1990 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required"
        },
        notes: "Tasmanian Building Services Authority requirements apply."
      }
      
    case "NT":
      return {
        ...baseRequirements,
        codeVersion: "NCC 2022 (NT Building Act 1993)",
        moistureThreshold: 20,
        dryingTimeStandard: "48-72 hours",
        dehumidificationRequired: true,
        certificationRequired: false,
        requirements: {
          moistureThreshold: 20,
          dehumidificationRequired: "If moisture > 20% AND structural materials affected",
          dryingAssessment: "48-72hr drying assessment required",
          moldTesting: "If visible mold or > 3 days damp: requires mold testing",
          asbestos: "Pre-1990 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required"
        },
        notes: "Northern Territory Building Control requirements apply."
      }
      
    case "ACT":
      return {
        ...baseRequirements,
        codeVersion: "NCC 2022 (ACT Building Act 2004)",
        moistureThreshold: 20,
        dryingTimeStandard: "48-72 hours",
        dehumidificationRequired: true,
        certificationRequired: false,
        requirements: {
          moistureThreshold: 20,
          dehumidificationRequired: "If moisture > 20% AND structural materials affected",
          dryingAssessment: "48-72hr drying assessment required",
          moldTesting: "If visible mold or > 3 days damp: requires mold testing",
          asbestos: "Pre-1990 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required"
        },
        notes: "ACT Planning and Land Authority requirements apply."
      }
      
    default:
      return baseRequirements
  }
}

/**
 * Check if building code requirements are triggered based on inspection data
 */
export function checkBuildingCodeTriggers(
  requirements: BuildingCodeRequirements,
  inspectionData: {
    maxMoistureLevel: number
    hasDrywall: boolean
    hasStructuralMaterials: boolean
    daysSinceLoss?: number
    buildingAge?: number
  }
): {
  triggered: boolean
  triggers: string[]
  requiredActions: string[]
} {
  const triggers: string[] = []
  const requiredActions: string[] = []
  
  // Check moisture threshold
  if (requirements.moistureThreshold && inspectionData.maxMoistureLevel > requirements.moistureThreshold) {
    if (inspectionData.hasDrywall || inspectionData.hasStructuralMaterials) {
      triggers.push(`Moisture level (${inspectionData.maxMoistureLevel}%) exceeds threshold (${requirements.moistureThreshold}%)`)
      
      if (requirements.dehumidificationRequired) {
        requiredActions.push("Dehumidification is mandatory")
      }
      
      if (requirements.dryingTimeStandard) {
        requiredActions.push(`Drying assessment required: ${requirements.dryingTimeStandard}`)
      }
    }
  }
  
  // Check mold testing requirement
  if (inspectionData.daysSinceLoss && inspectionData.daysSinceLoss > 3) {
    triggers.push(`Water damage has been present for ${inspectionData.daysSinceLoss} days`)
    requiredActions.push("Mold testing required (water present > 3 days)")
  }
  
  // Check asbestos requirement
  if (inspectionData.buildingAge && inspectionData.buildingAge < 1990) {
    triggers.push(`Building age (${inspectionData.buildingAge}) indicates potential asbestos presence`)
    requiredActions.push("Asbestos assessment required (pre-1990 building)")
  }
  
  // Check lead requirement
  if (inspectionData.buildingAge && inspectionData.buildingAge < 1970) {
    triggers.push(`Building age (${inspectionData.buildingAge}) indicates potential lead paint presence`)
    requiredActions.push("Lead paint assessment required (pre-1970 building)")
  }
  
  return {
    triggered: triggers.length > 0,
    triggers,
    requiredActions
  }
}

