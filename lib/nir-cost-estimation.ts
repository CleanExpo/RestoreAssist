/**
 * NIR Cost Estimation Engine
 * Calculates costs based on scope items and cost database
 * Uses item rates × quantities with contingency
 */

import { prisma } from "@/lib/prisma"

export interface CostEstimateItem {
  scopeItemId?: string
  category: string
  description: string
  quantity: number
  unit: string
  rate: number
  subtotal: number
  costDatabaseId?: string
  isEstimated: boolean
}

export interface CostEstimateResult {
  items: CostEstimateItem[]
  subtotal: number
  contingency: number
  contingencyPercentage: number
  total: number
  breakdown: {
    equipment: number
    labor: number
    materials: number
    other: number
  }
}

/**
 * Estimate costs for scope items
 */
export async function estimateCosts(
  scopeItems: Array<{
    itemType: string
    description: string
    quantity?: number
    unit?: string
    specification?: string
  }>,
  region?: string
): Promise<CostEstimateResult> {
  const estimateItems: CostEstimateItem[] = []
  
  // Get cost database entries (or use defaults)
  const costDatabase = await getCostDatabase(region)
  
  // Map scope items to cost items
  for (const scopeItem of scopeItems) {
    const costItem = await getCostForScopeItem(scopeItem, costDatabase)
    if (costItem) {
      estimateItems.push(costItem)
    }
  }
  
  // Calculate subtotal
  const subtotal = estimateItems.reduce((sum, item) => sum + item.subtotal, 0)
  
  // Calculate breakdown by category
  const breakdown = {
    equipment: estimateItems
      .filter(item => item.category === "Equipment")
      .reduce((sum, item) => sum + item.subtotal, 0),
    labor: estimateItems
      .filter(item => item.category === "Labor")
      .reduce((sum, item) => sum + item.subtotal, 0),
    materials: estimateItems
      .filter(item => item.category === "Materials")
      .reduce((sum, item) => sum + item.subtotal, 0),
    other: estimateItems
      .filter(item => !["Equipment", "Labor", "Materials"].includes(item.category))
      .reduce((sum, item) => sum + item.subtotal, 0)
  }
  
  // Apply contingency (10-15% based on complexity)
  const contingencyPercentage = calculateContingencyPercentage(scopeItems)
  const contingency = subtotal * (contingencyPercentage / 100)
  const total = subtotal + contingency
  
  return {
    items: estimateItems,
    subtotal,
    contingency,
    contingencyPercentage,
    total,
    breakdown
  }
}

/**
 * Get cost database entries (from database or defaults)
 */
async function getCostDatabase(region?: string): Promise<Map<string, any>> {
  try {
    // Try to get from database
    const costItems = await prisma.costDatabase.findMany({
      where: {
        isActive: true,
        ...(region ? { region } : { region: null })
      }
    })
    
    const costMap = new Map()
    for (const item of costItems) {
      costMap.set(item.itemType, item)
    }
    
    // If no database entries, use defaults
    if (costMap.size === 0) {
      return getDefaultCostDatabase()
    }
    
    return costMap
  } catch (error) {
    console.error("Error fetching cost database:", error)
    return getDefaultCostDatabase()
  }
}

/**
 * Default cost database (national averages)
 */
function getDefaultCostDatabase(): Map<string, any> {
  const defaults = new Map()
  
  // Equipment rental (daily rates)
  defaults.set("install_dehumidification", {
    itemType: "install_dehumidification",
    category: "Equipment",
    description: "Dehumidifier Rental",
    unit: "day",
    minRate: 40,
    maxRate: 60,
    averageRate: 50
  })
  
  defaults.set("install_air_movers", {
    itemType: "install_air_movers",
    category: "Equipment",
    description: "Air Mover Rental",
    unit: "day",
    minRate: 20,
    maxRate: 30,
    averageRate: 25
  })
  
  // Labor/Materials (per sq ft)
  defaults.set("remove_carpet", {
    itemType: "remove_carpet",
    category: "Labor",
    description: "Carpet Removal",
    unit: "sq ft",
    minRate: 1.50,
    maxRate: 2.50,
    averageRate: 2.00
  })
  
  defaults.set("demolish_drywall", {
    itemType: "demolish_drywall",
    category: "Labor",
    description: "Drywall Removal",
    unit: "sq ft",
    minRate: 2.00,
    maxRate: 3.50,
    averageRate: 2.75
  })
  
  defaults.set("apply_antimicrobial", {
    itemType: "apply_antimicrobial",
    category: "Materials",
    description: "Antimicrobial Treatment",
    unit: "sq ft",
    minRate: 0.50,
    maxRate: 1.50,
    averageRate: 1.00
  })
  
  defaults.set("sanitize_materials", {
    itemType: "sanitize_materials",
    category: "Materials",
    description: "Material Sanitization",
    unit: "sq ft",
    minRate: 0.75,
    maxRate: 1.25,
    averageRate: 1.00
  })
  
  defaults.set("extract_standing_water", {
    itemType: "extract_standing_water",
    category: "Labor",
    description: "Water Extraction",
    unit: "job",
    minRate: 500,
    maxRate: 2000,
    averageRate: 1000
  })
  
  defaults.set("containment_setup", {
    itemType: "containment_setup",
    category: "Materials",
    description: "Containment Setup",
    unit: "job",
    minRate: 200,
    maxRate: 500,
    averageRate: 350
  })
  
  defaults.set("ppe_required", {
    itemType: "ppe_required",
    category: "Materials",
    description: "Personal Protective Equipment",
    unit: "job",
    minRate: 50,
    maxRate: 150,
    averageRate: 100
  })
  
  defaults.set("mold_testing", {
    itemType: "mold_testing",
    category: "Other",
    description: "Mold Testing",
    unit: "test",
    minRate: 200,
    maxRate: 400,
    averageRate: 300
  })
  
  defaults.set("asbestos_assessment", {
    itemType: "asbestos_assessment",
    category: "Other",
    description: "Asbestos Assessment",
    unit: "assessment",
    minRate: 300,
    maxRate: 600,
    averageRate: 450
  })
  
  defaults.set("lead_assessment", {
    itemType: "lead_assessment",
    category: "Other",
    description: "Lead Paint Assessment",
    unit: "assessment",
    minRate: 250,
    maxRate: 500,
    averageRate: 375
  })
  
  defaults.set("dry_out_structure", {
    itemType: "dry_out_structure",
    category: "Labor",
    description: "Structural Drying",
    unit: "job",
    minRate: 500,
    maxRate: 1500,
    averageRate: 1000
  })
  
  return defaults
}

/**
 * Get cost for a specific scope item
 */
async function getCostForScopeItem(
  scopeItem: {
    itemType: string
    description: string
    quantity?: number
    unit?: string
    specification?: string
  },
  costDatabase: Map<string, any>
): Promise<CostEstimateItem | null> {
  const costEntry = costDatabase.get(scopeItem.itemType)
  
  if (!costEntry) {
    // No cost entry found, return null (item won't be included in estimate)
    return null
  }
  
  // Determine quantity and unit
  let quantity = scopeItem.quantity || 1
  let unit = scopeItem.unit || costEntry.unit || "unit"
  
  // Special handling for equipment (typically daily rental)
  if (scopeItem.itemType === "install_dehumidification" || 
      scopeItem.itemType === "install_air_movers") {
    // Estimate days based on class (default 5 days for Class 2, 7 days for Class 3)
    if (!scopeItem.quantity) {
      quantity = 5 // Default 5 days
      unit = "day"
    }
  }
  
  // Use average rate from cost database
  const rate = costEntry.averageRate || costEntry.minRate || 0
  
  // Calculate subtotal
  const subtotal = quantity * rate
  
  return {
    category: costEntry.category || "Other",
    description: scopeItem.description || costEntry.description,
    quantity,
    unit,
    rate,
    subtotal,
    costDatabaseId: costEntry.id,
    isEstimated: true
  }
}

/**
 * Calculate contingency percentage based on complexity
 */
function calculateContingencyPercentage(scopeItems: any[]): number {
  // Base contingency: 10%
  let contingency = 10
  
  // Increase for Category 2/3 (more complex)
  const hasCategory2Or3 = scopeItems.some(item => 
    item.justification?.includes("Category 2") || 
    item.justification?.includes("Category 3")
  )
  if (hasCategory2Or3) {
    contingency += 2
  }
  
  // Increase for specialty items (mold testing, asbestos, etc.)
  const hasSpecialtyItems = scopeItems.some(item => 
    item.itemType?.includes("mold") ||
    item.itemType?.includes("asbestos") ||
    item.itemType?.includes("lead")
  )
  if (hasSpecialtyItems) {
    contingency += 2
  }
  
  // Increase for large areas (>500 sq ft)
  const totalArea = scopeItems
    .filter(item => item.unit === "sq ft")
    .reduce((sum, item) => sum + (item.quantity || 0), 0)
  if (totalArea > 500) {
    contingency += 1
  }
  
  // Cap at 15%
  return Math.min(15, contingency)
}

