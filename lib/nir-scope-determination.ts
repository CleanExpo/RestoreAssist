/**
 * NIR Automatic Scope Determination Engine
 * Determines required scope items based on:
 * - IICRC classification (Category & Class)
 * - Building code requirements
 * - Affected areas and surface types
 * - Water source contamination level
 */

import { BuildingCodeRequirements } from "./nir-building-codes"

export interface ScopeItem {
  itemType: string
  description: string
  justification: string
  standardReference: string
  quantity?: number
  unit?: string
  specification?: string
  isRequired: boolean
}

export interface ScopeDeterminationInput {
  category: string
  class: string
  waterSource: string
  affectedAreas: Array<{
    roomZoneId: string
    affectedSquareFootage: number
    surfaceType?: string
    moistureLevel?: number
  }>
  buildingCodeRequirements?: BuildingCodeRequirements
  buildingCodeTriggers?: {
    triggered: boolean
    triggers: string[]
    requiredActions: string[]
  }
  environmentalData?: {
    ambientTemperature: number
    humidityLevel: number
  }
}

/**
 * Determine required scope items automatically
 */
export function determineScopeItems(input: ScopeDeterminationInput): ScopeItem[] {
  const scopeItems: ScopeItem[] = []
  
  // Calculate total affected area
  const totalAffectedArea = input.affectedAreas.reduce(
    (sum, area) => sum + area.affectedSquareFootage,
    0
  )
  
  // Base scope items based on Category
  if (input.category === "3" || input.category === "2") {
    // Category 2/3: Contamination control required
    scopeItems.push({
      itemType: "containment_setup",
      description: "Containment Setup",
      justification: `Category ${input.category} water requires containment to prevent cross-contamination per IICRC S500.`,
      standardReference: "IICRC S500 Section 4.2-4.3",
      isRequired: true
    })
    
    scopeItems.push({
      itemType: "ppe_required",
      description: "Personal Protective Equipment (PPE)",
      justification: `Category ${input.category} water requires appropriate PPE for worker safety.`,
      standardReference: "IICRC S500 Section 4.2-4.3; WHS Regulations 2011",
      isRequired: true
    })
    
    scopeItems.push({
      itemType: "apply_antimicrobial",
      description: "Apply Antimicrobial Treatment",
      justification: `Category ${input.category} water requires antimicrobial treatment to prevent microbial growth.`,
      standardReference: "IICRC S500 Section 4.2-4.3",
      isRequired: true,
      quantity: totalAffectedArea,
      unit: "sq ft"
    })
  }
  
  // Base scope items based on Class
  if (input.class === "2" || input.class === "3" || input.class === "4") {
    scopeItems.push({
      itemType: "install_dehumidification",
      description: "Install Dehumidification Equipment",
      justification: `Class ${input.class} requires dehumidification equipment per IICRC S500.`,
      standardReference: "IICRC S500 Section 5.2-5.4",
      isRequired: true
    })
    
    scopeItems.push({
      itemType: "install_air_movers",
      description: "Install Air Movers",
      justification: `Class ${input.class} requires air movement equipment for effective drying.`,
      standardReference: "IICRC S500 Section 5.2-5.4",
      isRequired: true
    })
  }
  
  // Extract standing water (always required if present)
  scopeItems.push({
    itemType: "extract_standing_water",
    description: "Extract Standing Water",
    justification: "Standing water must be extracted to begin drying process per IICRC S500.",
    standardReference: "IICRC S500 Section 6",
    isRequired: true
  })
  
  // Check for drywall in affected areas
  const hasDrywall = input.affectedAreas.some(area => 
    area.surfaceType?.toLowerCase().includes("drywall") ||
    area.surfaceType?.toLowerCase().includes("gyprock") ||
    area.surfaceType?.toLowerCase().includes("plaster")
  )
  
  if (hasDrywall) {
    // Check moisture levels for drywall
    const drywallAreas = input.affectedAreas.filter(area => 
      area.surfaceType?.toLowerCase().includes("drywall") ||
      area.surfaceType?.toLowerCase().includes("gyprock") ||
      area.surfaceType?.toLowerCase().includes("plaster")
    )
    
    const highMoistureDrywall = drywallAreas.some(area => 
      (area.moistureLevel || 0) > 20
    )
    
    if (highMoistureDrywall || input.category === "2" || input.category === "3") {
      scopeItems.push({
        itemType: "demolish_drywall",
        description: "Demolish Affected Drywall",
        justification: "Drywall with moisture > 20% or Category 2/3 contamination requires removal per IICRC S500 and building codes.",
        standardReference: "IICRC S500 Section 6; NCC 2022",
        isRequired: true,
        quantity: drywallAreas.reduce((sum, area) => sum + area.affectedSquareFootage, 0),
        unit: "sq ft",
        specification: "Remove to 12 inches above highest moisture reading"
      })
    }
  }
  
  // Check for carpet in affected areas
  const hasCarpet = input.affectedAreas.some(area => 
    area.surfaceType?.toLowerCase().includes("carpet")
  )
  
  if (hasCarpet) {
    const carpetAreas = input.affectedAreas.filter(area => 
      area.surfaceType?.toLowerCase().includes("carpet")
    )
    
    // Carpet removal typically required for Category 2/3 or high moisture
    if (input.category === "2" || input.category === "3" || 
        carpetAreas.some(area => (area.moistureLevel || 0) > 15)) {
      scopeItems.push({
        itemType: "remove_carpet",
        description: "Remove Affected Carpet",
        justification: "Carpet affected by Category 2/3 water or high moisture requires removal per IICRC S500.",
        standardReference: "IICRC S500 Section 6",
        isRequired: true,
        quantity: carpetAreas.reduce((sum, area) => sum + area.affectedSquareFootage, 0),
        unit: "sq ft"
      })
    }
  }
  
  // Building code requirements
  if (input.buildingCodeTriggers?.triggered) {
    // Add scope items based on building code triggers
    if (input.buildingCodeTriggers.requiredActions.some(action => 
      action.toLowerCase().includes("dehumidification")
    )) {
      // Ensure dehumidification is in scope (may already be added)
      if (!scopeItems.some(item => item.itemType === "install_dehumidification")) {
        scopeItems.push({
          itemType: "install_dehumidification",
          description: "Install Dehumidification Equipment (Building Code Requirement)",
          justification: `Building code requires dehumidification: ${input.buildingCodeRequirements?.requirements.dehumidificationRequired || "Mandatory"}`,
          standardReference: `${input.buildingCodeRequirements?.codeVersion || "NCC 2022"}`,
          isRequired: true
        })
      }
    }
    
    if (input.buildingCodeTriggers.requiredActions.some(action => 
      action.toLowerCase().includes("mold testing")
    )) {
      scopeItems.push({
        itemType: "mold_testing",
        description: "Mold Testing (Building Code Requirement)",
        justification: "Building code requires mold testing due to extended water exposure.",
        standardReference: `${input.buildingCodeRequirements?.codeVersion || "NCC 2022"}`,
        isRequired: true
      })
    }
    
    if (input.buildingCodeTriggers.requiredActions.some(action => 
      action.toLowerCase().includes("asbestos")
    )) {
      scopeItems.push({
        itemType: "asbestos_assessment",
        description: "Asbestos Assessment (Building Code Requirement)",
        justification: "Building code requires asbestos assessment for pre-1990 buildings.",
        standardReference: `${input.buildingCodeRequirements?.codeVersion || "NCC 2022"}; WHS Regulations 2011`,
        isRequired: true
      })
    }
    
    if (input.buildingCodeTriggers.requiredActions.some(action => 
      action.toLowerCase().includes("lead")
    )) {
      scopeItems.push({
        itemType: "lead_assessment",
        description: "Lead Paint Assessment (Building Code Requirement)",
        justification: "Building code requires lead paint assessment for pre-1970 buildings.",
        standardReference: `${input.buildingCodeRequirements?.codeVersion || "NCC 2022"}; WHS Regulations 2011`,
        isRequired: true
      })
    }
  }
  
  // Sanitization for Category 2/3
  if (input.category === "2" || input.category === "3") {
    scopeItems.push({
      itemType: "sanitize_materials",
      description: "Sanitize Affected Materials",
      justification: `Category ${input.category} water requires sanitization of affected materials.`,
      standardReference: "IICRC S500 Section 4.2-4.3",
      isRequired: true,
      quantity: totalAffectedArea,
      unit: "sq ft"
    })
  }
  
  // Drying out structure (always required)
  scopeItems.push({
    itemType: "dry_out_structure",
    description: "Dry Out Structure",
    justification: "Structural drying required per IICRC S500 to restore materials to pre-loss condition.",
    standardReference: "IICRC S500 Section 5",
    isRequired: true
  })
  
  return scopeItems
}

