// Automatic trigger logic based on user responses

export interface AutoTrigger {
  type: 'hazard' | 'protocol' | 'notification' | 'specialist' | 'timeline' | 'equipment'
  trigger: string
  action: string
  severity: 'critical' | 'warning' | 'info'
}

export function analyzeAutoTriggers(tier1: any, tier2: any, tier3: any): AutoTrigger[] {
  const triggers: AutoTrigger[] = []

  if (!tier1) return triggers

  // Pre-1970 Construction → Asbestos & Lead Paint Risk
  if (tier1.T1_Q2_constructionYear?.includes('Pre-1970')) {
    triggers.push({
      type: 'hazard',
      trigger: 'Pre-1970 construction',
      action: 'Automatically flag asbestos risk and lead paint risk. Adjust PPE requirements. Add specialist referral notes.',
      severity: 'critical'
    })
  }

  if (tier1.T1_Q2_constructionYear?.includes('1970-1985')) {
    triggers.push({
      type: 'hazard',
      trigger: '1970-1985 construction',
      action: 'Automatically flag asbestos risk. Adjust PPE requirements.',
      severity: 'warning'
    })
  }

  // Category 2 or 3 Water → Biohazard Protocols
  const waterSource = tier1.T1_Q3_waterSource || ''
  if (waterSource.includes('Category 2') || 
      waterSource.includes('Category 3') ||
      waterSource.includes('Sewage') ||
      waterSource.includes('biohazard') ||
      waterSource.includes('contaminated')) {
    triggers.push({
      type: 'protocol',
      trigger: 'Category 2/3 water',
      action: 'Automatically trigger biohazard protocols. Flag EPA notification requirement. Add specialist contractor requirements. Adjust PPE and air filtration requirements.',
      severity: 'critical'
    })
  }

  // Yellow Tongue Particleboard → Class 4 Drying
  const materials = tier1.T1_Q6_materialsAffected || []
  if (materials.some((m: string) => m.includes('Yellow tongue'))) {
    triggers.push({
      type: 'protocol',
      trigger: 'Yellow tongue particleboard identified',
      action: 'Automatically trigger Class 4 drying protocols. Add sandwich drying methodology. Add injection system requirements. Flag for manual specialist quote.',
      severity: 'critical'
    })
  }

  // Any Hazard Selected → STOP WORK Flags
  const hazards = tier1.T1_Q7_hazards || []
  if (hazards.length > 0 && !hazards.includes('None identified')) {
    hazards.forEach((hazard: string) => {
      if (hazard.includes('asbestos')) {
        triggers.push({
          type: 'hazard',
          trigger: 'Asbestos hazard',
          action: 'Create STOP WORK flag. Add specialist referral line items. Flag WorkSafe notification. Create cost line for abatement specialist. May prevent certain work from being quoted.',
          severity: 'critical'
        })
      }
      if (hazard.includes('mould')) {
        triggers.push({
          type: 'hazard',
          trigger: 'Mould hazard',
          action: 'Create STOP WORK flag. Refer to IICRC S520-certified specialist. Flag for mould remediation cost.',
          severity: 'critical'
        })
      }
      if (hazard.includes('Biohazard')) {
        triggers.push({
          type: 'hazard',
          trigger: 'Biohazard contamination',
          action: 'Create STOP WORK flag. Flag EPA notification. Add biohazard specialist requirements.',
          severity: 'critical'
        })
      }
      if (hazard.includes('Electrical')) {
        triggers.push({
          type: 'hazard',
          trigger: 'Electrical hazard',
          action: 'Flag electrician clearance required before work begins.',
          severity: 'critical'
        })
      }
    })
  }

  // Multi-Storey Property → Water Migration
  if (tier1.T1_Q1_propertyType?.includes('Multi-storey') || 
      tier1.T1_Q1_propertyType?.includes('high-rise') ||
      tier1.T1_Q1_propertyType?.includes('low-rise')) {
    triggers.push({
      type: 'protocol',
      trigger: 'Multi-storey property',
      action: 'Automatically trigger water migration questions in Tier 2. Adjust drying protocols for multi-level. Extend timeline estimates.',
      severity: 'info'
    })
  }

  // Extended Water Exposure >72 hours
  const waterDuration = tier1.T1_Q8_waterDuration || ''
  if (waterDuration.includes('3-7 days') || 
      waterDuration.includes('1-2 weeks') ||
      waterDuration.includes('> 2 weeks')) {
    triggers.push({
      type: 'protocol',
      trigger: 'Extended water exposure (>72 hours)',
      action: 'Automatically flag secondary damage risk. Add mould advisory. Extend drying timeline. Add occupant health warning.',
      severity: 'warning'
    })
  }

  // Heritage Property → Special Requirements
  if (tier1.T1_Q1_propertyType?.includes('Heritage')) {
    triggers.push({
      type: 'protocol',
      trigger: 'Heritage-listed property',
      action: 'Trigger heritage-specific building codes. Conservation protocols required. Material preservation requirements.',
      severity: 'warning'
    })
  }

  // Structural Concerns → Builder Required
  if (tier2?.T2_Q5_structuralConcerns && 
      tier2.T2_Q5_structuralConcerns.length > 0 &&
      !tier2.T2_Q5_structuralConcerns.includes('None identified')) {
    triggers.push({
      type: 'specialist',
      trigger: 'Structural concerns identified',
      action: 'Flag builder/carpenter assessment required. May require structural engineer clearance.',
      severity: 'warning'
    })
  }

  // Building Services Affected → Licensed Trades
  if (tier2?.T2_Q6_buildingServicesAffected) {
    const services = tier2.T2_Q6_buildingServicesAffected
    if (services.some((s: string) => s.includes('Electrical'))) {
      triggers.push({
        type: 'specialist',
        trigger: 'Electrical services affected',
        action: 'Flag licensed electrician required before restoration begins.',
        severity: 'critical'
      })
    }
    if (services.some((s: string) => s.includes('Plumbing'))) {
      triggers.push({
        type: 'specialist',
        trigger: 'Plumbing services affected',
        action: 'Flag licensed plumber required before drying begins.',
        severity: 'critical'
      })
    }
  }

  // Class 4 Drying Confirmed
  if (tier3?.T3_Q5_class4DryingAssessment?.includes('Class 4 confirmed')) {
    triggers.push({
      type: 'protocol',
      trigger: 'Class 4 drying confirmed',
      action: 'Requires qualified specialist assessment and quote. Not included in preliminary estimate.',
      severity: 'critical'
    })
  }

  return triggers
}

export function applyAutoTriggersToReport(triggers: AutoTrigger[], reportData: any): any {
  // This function would modify the report generation logic based on triggers
  // For now, we'll return the triggers to be used in report generation
  return {
    ...reportData,
    autoTriggers: triggers
  }
}

