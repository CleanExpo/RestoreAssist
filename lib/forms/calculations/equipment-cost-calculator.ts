/**
 * Equipment Cost Estimation Calculator
 * Calculates costs for restoration equipment based on IICRC classification
 * Includes: air movers, dehumidifiers, air scrubbers, heaters, monitoring equipment
 */

/**
 * Equipment pricing configuration
 * Prices are per day rental rates in AUD
 */
export const EQUIPMENT_PRICING = {
  // Air Movement
  airMover: {
    standard: 45, // Standard air mover
    heavy: 65, // Heavy-duty air mover
    turbo: 85, // Turbo/high-velocity air mover
  },

  // Dehumidification
  dehumidifierLGR: 75, // LGR (large room) dehumidifier (1250 cu ft capacity)
  dehumidifierConventional: 35, // Conventional dehumidifier (500 cu ft capacity)

  // Air Cleaning
  airScrubber: 60, // HEPA air scrubber (for contaminated water)
  ozoneMachine: 50, // Ozone generator

  // Environmental Control
  heater: 40, // Portable heater
  thermostat: 15, // Digital thermostat/monitor

  // Monitoring
  moistureMeter: 25, // Hand-held moisture metre
  humidityMeter: 20, // Humidity monitor

  // Misc
  waterExtractor: 85, // Carpet water extractor
  structuralDrying: 95, // Structural/wall dryer
} as const

/**
 * Equipment rental cost estimate
 */
export interface EquipmentCostEstimate {
  equipment: {
    name: string
    quantity: number
    dailyRate: number
    subtotal: number
  }[]
  durationDays: number
  laborCostPerDay?: number
  laborDays?: number
  laborCost?: number
  subtotal: number
  contingency: number // 10% buffer
  total: number
  breakdown: {
    equipmentCost: number
    laborCost: number
    contingency: number
  }
}

/**
 * Equipment Cost Calculator
 */
export class EquipmentCostCalculator {
  /**
   * Calculate equipment costs based on IICRC classification
   */
  static calculateEquipmentCosts(
    iicrcClass: number,
    iicrcCategory: number,
    affectedSquareFootage: number,
    ceilingHeight: number = 2.7,
    durationDays: number = 5,
    laborCostPerDay: number = 200
  ): EquipmentCostEstimate {
    const cubicFootage = affectedSquareFootage * ceilingHeight

    // Calculate equipment needs based on IICRC class
    const equipmentNeeds = this.calculateEquipmentNeeds(
      iicrcClass,
      iicrcCategory,
      affectedSquareFootage,
      cubicFootage
    )

    // Build cost line items
    const equipmentItems = [
      {
        name: `Air Movers (Standard) - ${equipmentNeeds.airMovers}x`,
        quantity: equipmentNeeds.airMovers,
        dailyRate: EQUIPMENT_PRICING.airMover.standard,
      },
      {
        name: `Dehumidifiers (LGR) - ${equipmentNeeds.dehumidifiersLGR}x`,
        quantity: equipmentNeeds.dehumidifiersLGR,
        dailyRate: EQUIPMENT_PRICING.dehumidifierLGR,
      },
    ]

    // Add optional equipment for higher classes/categories
    if (equipmentNeeds.dehumidifiersConventional > 0) {
      equipmentItems.push({
        name: `Dehumidifiers (Conventional) - ${equipmentNeeds.dehumidifiersConventional}x`,
        quantity: equipmentNeeds.dehumidifiersConventional,
        dailyRate: EQUIPMENT_PRICING.dehumidifierConventional,
      })
    }

    if (iicrcCategory > 1) {
      // Add air scrubbers for contaminated water
      equipmentItems.push({
        name: `Air Scrubbers - ${equipmentNeeds.airScrubbers}x`,
        quantity: equipmentNeeds.airScrubbers,
        dailyRate: EQUIPMENT_PRICING.airScrubber,
      })
    }

    if (iicrcClass >= 3) {
      // Add heaters for stubborn drying
      equipmentItems.push({
        name: 'Portable Heater',
        quantity: 1,
        dailyRate: EQUIPMENT_PRICING.heater,
      })
    }

    // Add monitoring equipment
    equipmentItems.push(
      {
        name: 'Moisture Meter',
        quantity: 1,
        dailyRate: EQUIPMENT_PRICING.moistureMeter,
      },
      {
        name: 'Humidity Monitor',
        quantity: 1,
        dailyRate: EQUIPMENT_PRICING.humidityMeter,
      }
    )

    // Calculate equipment costs
    const equipment = equipmentItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      dailyRate: item.dailyRate,
      subtotal: item.quantity * item.dailyRate * durationDays,
    }))

    const equipmentCost = equipment.reduce((sum, item) => sum + item.subtotal, 0)

    // Calculate labor costs
    const laborCost = laborCostPerDay * durationDays

    // Calculate subtotal and contingency
    const subtotal = equipmentCost + laborCost
    const contingency = Math.round(subtotal * 0.1) // 10% buffer

    return {
      equipment,
      durationDays,
      laborCostPerDay,
      laborDays: durationDays,
      laborCost,
      subtotal,
      contingency,
      total: subtotal + contingency,
      breakdown: {
        equipmentCost,
        laborCost,
        contingency,
      },
    }
  }

  /**
   * Calculate equipment needs based on IICRC classification
   */
  static calculateEquipmentNeeds(
    iicrcClass: number,
    iicrcCategory: number,
    affectedSquareFootage: number,
    cubicFootage: number
  ) {
    // Air movers: based on affected area and class
    // Class 1: 1 per 200 sq ft, Class 2: 1 per 150 sq ft, Class 3: 1 per 100 sq ft, Class 4: 1 per 75 sq ft
    const airMoverRatios: Record<number, number> = { 1: 200, 2: 150, 3: 100, 4: 75 }
    const airMovers = Math.ceil(affectedSquareFootage / (airMoverRatios[iicrcClass] || 75))

    // Dehumidifiers (LGR): 1 per 1250 cubic feet
    const dehumidifiersLGR = Math.ceil(cubicFootage / 1250)

    // Additional conventional dehumidifiers for class 3-4
    const dehumidifiersConventional = iicrcClass >= 3 ? Math.ceil(affectedSquareFootage / 500) : 0

    // Air scrubbers: 1 per 500 sq ft for contaminated water (category 2-3)
    const airScrubbers = iicrcCategory > 1 ? Math.ceil(affectedSquareFootage / 500) : 0

    return {
      airMovers,
      dehumidifiersLGR,
      dehumidifiersConventional,
      airScrubbers,
    }
  }

  /**
   * Get cost estimate by duration range
   */
  static getCostEstimateRange(
    iicrcClass: number,
    iicrcCategory: number,
    affectedSquareFootage: number,
    ceilingHeight?: number,
    laborCostPerDay?: number
  ): {
    minDays: number
    maxDays: number
    minCost: number
    maxCost: number
    averageCost: number
  } {
    // Typical drying times based on class
    const dryingTimeRanges: Record<number, { min: number; max: number }> = {
      1: { min: 1, max: 3 },
      2: { min: 3, max: 5 },
      3: { min: 5, max: 7 },
      4: { min: 7, max: 10 },
    }

    const dryingRange = dryingTimeRanges[iicrcClass] || dryingTimeRanges[4]

    const minEstimate = this.calculateEquipmentCosts(
      iicrcClass,
      iicrcCategory,
      affectedSquareFootage,
      ceilingHeight,
      dryingRange.min,
      laborCostPerDay
    )

    const maxEstimate = this.calculateEquipmentCosts(
      iicrcClass,
      iicrcCategory,
      affectedSquareFootage,
      ceilingHeight,
      dryingRange.max,
      laborCostPerDay
    )

    return {
      minDays: dryingRange.min,
      maxDays: dryingRange.max,
      minCost: minEstimate.total,
      maxCost: maxEstimate.total,
      averageCost: Math.round((minEstimate.total + maxEstimate.total) / 2),
    }
  }

  /**
   * Format cost as currency string
   */
  static formatCost(cost: number): string {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
    }).format(cost)
  }

  /**
   * Get cost estimate summary text
   */
  static generateSummary(estimate: EquipmentCostEstimate): string {
    const lines: string[] = []

    lines.push('Equipment Cost Estimation Summary')
    lines.push('='.repeat(50))
    lines.push('')

    // Equipment breakdown
    lines.push('Equipment (per day):')
    estimate.equipment.forEach((item) => {
      const dailyTotal = item.quantity * item.dailyRate
      lines.push(`  ${item.name}: ${this.formatCost(dailyTotal)}`)
    })
    lines.push('')

    // Duration and labor
    lines.push(`Duration: ${estimate.durationDays} days`)
    if (estimate.laborCostPerDay) {
      lines.push(`Labor: ${this.formatCost(estimate.laborCostPerDay)} per day`)
    }
    lines.push('')

    // Totals
    lines.push(`Equipment Total: ${this.formatCost(estimate.breakdown.equipmentCost)}`)
    if (estimate.laborCost) {
      lines.push(`Labor Total: ${this.formatCost(estimate.laborCost)}`)
    }
    lines.push(`Subtotal: ${this.formatCost(estimate.subtotal)}`)
    lines.push(`Contingency (10%): ${this.formatCost(estimate.contingency)}`)
    lines.push('='.repeat(50))
    lines.push(`TOTAL: ${this.formatCost(estimate.total)}`)

    return lines.join('\n')
  }
}
