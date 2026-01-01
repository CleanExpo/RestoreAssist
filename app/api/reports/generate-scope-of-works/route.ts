import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { detectStateFromPostcode, getStateInfo } from '@/lib/state-detection'
import { getEquipmentGroupById, getEquipmentDailyRate } from '@/lib/equipment-matrix'
import { tryClaudeModels } from '@/lib/anthropic-models'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { pricingConfig: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { reportId } = await request.json()

    if (!reportId) {
      return NextResponse.json(
        { error: 'Report ID is required' },
        { status: 400 }
      )
    }

    const report = await prisma.report.findUnique({
      where: { id: reportId, userId: user.id }
    })

    if (!report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      )
    }

    const analysis = report.technicianReportAnalysis 
      ? JSON.parse(report.technicianReportAnalysis) 
      : null
    const tier1 = report.tier1Responses 
      ? JSON.parse(report.tier1Responses) 
      : null
    const tier2 = report.tier2Responses 
      ? JSON.parse(report.tier2Responses) 
      : null
    const tier3 = report.tier3Responses 
      ? JSON.parse(report.tier3Responses) 
      : null

    const pricingConfig = user.pricingConfig

    if (!pricingConfig) {
      return NextResponse.json(
        { error: 'Pricing configuration not found. Please configure your pricing in Settings.' },
        { status: 400 }
      )
    }

    const stateCode = detectStateFromPostcode(report.propertyPostcode || '')
    const stateInfo = getStateInfo(stateCode)

    const integrations = await prisma.integration.findMany({
      where: {
        userId: user.id,
        status: 'CONNECTED',
        apiKey: { not: null }
      }
    })

    const integration = integrations.find(i => 
      i.name === 'Anthropic Claude' || 
      i.name === 'Anthropic API' ||
      i.name.toLowerCase().includes('anthropic')
    )

    if (!integration?.apiKey) {
      return NextResponse.json(
        { error: 'No connected Anthropic API integration found. Please connect an Anthropic API key.' },
        { status: 400 }
      )
    }

    const anthropic = new Anthropic({
      apiKey: integration.apiKey
    })

    // Parse equipment selection data (from Equipment Tools Selection step)
    const equipmentSelection = report.equipmentSelection 
      ? JSON.parse(report.equipmentSelection) 
      : []
    
    // Parse psychrometric assessment and scope areas
    const psychrometricAssessment = report.psychrometricAssessment 
      ? JSON.parse(report.psychrometricAssessment) 
      : null
    const scopeAreas = report.scopeAreas 
      ? JSON.parse(report.scopeAreas) 
      : []
    
    const scopeData = buildScopeOfWorksData({
      report,
      analysis,
      tier1,
      tier2,
      tier3,
      pricingConfig,
      stateInfo,
      equipmentSelection,
      psychrometricAssessment,
      scopeAreas
    })

    const scopeDocument = buildScopeOfWorksDocument(scopeData)

    const updatedReport = await prisma.report.update({
      where: { id: reportId },
      data: {
        scopeOfWorksDocument: scopeDocument,
        scopeOfWorksData: JSON.stringify(scopeData),
        updatedAt: new Date()
      }
    })

    return NextResponse.json({ 
      report: {
        ...updatedReport,
        scopeOfWorksDocument: scopeDocument,
        scopeOfWorksData: scopeData
      },
      scopeOfWorks: {
        document: scopeDocument,
        data: scopeData
      },
      message: 'Scope of Works generated successfully'
    })
  } catch (error) {
    console.error('Error generating scope of works:', error)
    return NextResponse.json(
      { error: 'Failed to generate scope of works', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

function buildScopeOfWorksData(data: {
  report: any
  analysis: any
  tier1: any
  tier2: any
  tier3: any
  pricingConfig: any
  stateInfo: any
  equipmentSelection?: any[]
  psychrometricAssessment?: any
  scopeAreas?: any[]
}) {
  const { report, analysis, tier1, tier2, tier3, pricingConfig, stateInfo, equipmentSelection = [], psychrometricAssessment, scopeAreas = [] } = data

  if (!pricingConfig) {
    throw new Error('Pricing configuration is required')
  }

  const ensureNumber = (value: any): number => {
    if (value === null || value === undefined || value === '') {
      return 0
    }
    const num = typeof value === 'string' ? parseFloat(value) : Number(value)
    if (isNaN(num)) {
      return 0
    }
    return num
  }

  const rates = {
    masterQualifiedNormalHours: ensureNumber(pricingConfig.masterQualifiedNormalHours),
    qualifiedTechnicianNormalHours: ensureNumber(pricingConfig.qualifiedTechnicianNormalHours),
    labourerNormalHours: ensureNumber(pricingConfig.labourerNormalHours),
    airMoverAxialDailyRate: ensureNumber(pricingConfig.airMoverAxialDailyRate),
    dehumidifierLGRDailyRate: ensureNumber(pricingConfig.dehumidifierLGRDailyRate),
    afdUnitLargeDailyRate: ensureNumber(pricingConfig.afdUnitLargeDailyRate),
    extractionTruckMountedHourlyRate: ensureNumber(pricingConfig.extractionTruckMountedHourlyRate),
    injectionDryingSystemDailyRate: ensureNumber(pricingConfig.injectionDryingSystemDailyRate),
    thermalCameraUseCostPerAssessment: ensureNumber(pricingConfig.thermalCameraUseCostPerAssessment),
    antimicrobialTreatmentRate: ensureNumber(pricingConfig.antimicrobialTreatmentRate),
    mouldRemediationTreatmentRate: ensureNumber(pricingConfig.mouldRemediationTreatmentRate),
    biohazardTreatmentRate: ensureNumber(pricingConfig.biohazardTreatmentRate),
    callOutFee: ensureNumber(pricingConfig.callOutFee),
    administrationFee: ensureNumber(pricingConfig.administrationFee)
  }

  // Extract key information
  const waterCategory = tier1?.T1_Q3_waterSource 
    ? extractWaterCategory(tier1.T1_Q3_waterSource)
    : (report.waterCategory || analysis?.waterCategory || 'Category 1')
  
  const materials = tier1?.T1_Q6_materialsAffected || []
  const hasYellowTongue = materials.some((m: string) => m.includes('Yellow tongue'))
  const class4Drying = tier3?.T3_Q5_class4DryingAssessment || 'Uncertain'
  const needsClass4 = class4Drying.includes('Class 4') || class4Drying.includes('Class 3 or 4')
  
  const hazards = tier1?.T1_Q7_hazards || []
  const hasAsbestos = hazards.some((h: string) => h.includes('asbestos'))
  const hasMould = hazards.some((h: string) => h.includes('mould'))
  const hasBiohazard = hazards.some((h: string) => h.includes('Biohazard'))
  
  const structuralConcerns = tier2?.T2_Q5_structuralConcerns || []
  const needsBuilder = structuralConcerns.length > 0 && !structuralConcerns.includes('None identified')
  
  const buildingServices = tier2?.T2_Q6_buildingServicesAffected || []
  const needsElectrician = buildingServices.some((s: string) => s.includes('Electrical'))
  const needsPlumber = tier1?.T1_Q3_waterSource?.includes('pipe') || tier1?.T1_Q3_waterSource?.includes('toilet')
  
  const affectedArea = tier3?.T3_Q4_totalAffectedArea || 'Not specified'
  
  // Calculate affected area in sqm (no default - only use if provided)
  const areaMatch = affectedArea.match(/(\d+)\s*sqm/i) || affectedArea.match(/=\s*(\d+)/)
  const affectedAreaSqm = areaMatch ? parseFloat(areaMatch[1]) : 
                         (report.affectedArea ? parseFloat(String(report.affectedArea)) : 0)
  
  // Use actual equipment selection data if available, otherwise use 0 (no defaults)
  const equipmentSelections = Array.isArray(equipmentSelection) ? equipmentSelection : []
  
  // Calculate equipment quantities from actual selections
  let airMoversQty = 0
  let dehumidifiersQty = 0
  let afdQty = 0
  
  equipmentSelections.forEach((sel: any) => {
    if (sel.groupId && sel.quantity) {
      if (sel.groupId.startsWith('airmover-')) {
        airMoversQty += sel.quantity || 0
      } else if (sel.groupId.startsWith('lgr-') || sel.groupId.startsWith('desiccant-')) {
        dehumidifiersQty += sel.quantity || 0
      } else if (sel.groupId.includes('afd')) {
        afdQty += sel.quantity || 0
      }
    }
  })
  
  // Use actual drying duration from report if available, otherwise calculate based on data
  const dryingDuration = report.estimatedDryingDuration || 
                        analysis?.estimatedDryingDuration || 
                        (tier3?.T3_Q2_dryingPreferences ? parseInt(tier3.T3_Q2_dryingPreferences.match(/(\d+)\s*days?/i)?.[1] || '0') : null) ||
                        (needsClass4 ? 14 : (affectedAreaSqm > 50 ? 10 : 7))

  // Calculate extraction hours based on affected area or use from analysis
  // Standard: 1 hour per 25 sqm, minimum 2 hours, maximum 8 hours
  const extractionHours = analysis?.extractionHours || 
                         (affectedAreaSqm > 0 ? Math.max(2, Math.min(8, Math.ceil(affectedAreaSqm / 25))) : 4)

  // Build line items
  const lineItems = [
    {
      id: 'RW_1',
      description: 'Emergency Call-Out & Site Assessment',
      qty: 1,
      unit: 'Call-out',
      rate: rates.callOutFee,
      subtotal: rates.callOutFee
    },
    {
      id: 'RW_2',
      description: 'Standing Water Extraction (Truck-Mounted Unit)',
      qty: extractionHours,
      unit: 'Hour',
      rate: rates.extractionTruckMountedHourlyRate,
      subtotal: extractionHours * rates.extractionTruckMountedHourlyRate
    },
    {
      id: 'RW_3',
      description: 'Initial Drying Equipment Deployment & Setup',
      qty: 1,
      unit: 'Setup',
      labour: {
        masterQualified: { hours: 4, rate: rates.masterQualifiedNormalHours },
        qualified: { hours: 6, rate: rates.qualifiedTechnicianNormalHours }
      },
      equipment: equipmentSelections.length > 0 ? equipmentSelections.reduce((acc: any, sel: any) => {
        if (sel.quantity > 0) {
          const group = getEquipmentGroupById(sel.groupId)
          const dailyRate = sel.dailyRate || getEquipmentDailyRate(sel.groupId, pricingConfig)
          const key = sel.groupId.startsWith('lgr-') ? 'lgr' :
                     sel.groupId.startsWith('desiccant-') ? 'desiccant' :
                     sel.groupId.startsWith('airmover-') ? 'airMovers' :
                     sel.groupId.startsWith('heat-') ? 'heat' :
                     sel.groupId.includes('afd') ? 'afd' : 'other'
          
          if (!acc[key]) {
            acc[key] = { qty: 0, days: dryingDuration, rate: dailyRate, items: [] }
          }
          acc[key].qty += sel.quantity
          acc[key].items.push({
            groupId: sel.groupId,
            name: group?.name || sel.groupId,
            quantity: sel.quantity,
            dailyRate: dailyRate
          })
        }
        return acc
      }, {}) : {},
      subtotal: equipmentSelections.length > 0 
        ? (() => {
            const labour = (4 * rates.masterQualifiedNormalHours) + (6 * rates.qualifiedTechnicianNormalHours)
            const equipmentCost = equipmentSelections.reduce((total: number, sel: any) => {
              if (sel.quantity > 0) {
                const dailyRate = sel.dailyRate || getEquipmentDailyRate(sel.groupId, pricingConfig)
                return total + (dailyRate * sel.quantity * dryingDuration)
              }
              return total
            }, 0)
            return labour + equipmentCost
          })()
        : (4 * rates.masterQualifiedNormalHours) + (6 * rates.qualifiedTechnicianNormalHours)
    },
    {
      id: 'RW_4',
      description: 'Moisture Assessment & Thermal Imaging',
      qty: dryingDuration >= 7 ? 3 : (dryingDuration >= 4 ? 2 : 1), // Standard: 3 assessments for 7+ days, 2 for 4-6 days, 1 for shorter
      unit: dryingDuration >= 7 ? 'Assessment (Days 0, 3, 7)' : (dryingDuration >= 4 ? 'Assessment (Days 0, Final)' : 'Assessment (Day 0)'),
      labour: {
        masterQualified: { hours: dryingDuration >= 7 ? 3 : (dryingDuration >= 4 ? 2 : 1), rate: rates.masterQualifiedNormalHours }
      },
      equipment: {
        thermalCamera: { qty: dryingDuration >= 7 ? 3 : (dryingDuration >= 4 ? 2 : 1), rate: rates.thermalCameraUseCostPerAssessment }
      },
      subtotal: (() => {
        const assessmentCount = dryingDuration >= 7 ? 3 : (dryingDuration >= 4 ? 2 : 1)
        return (assessmentCount * rates.masterQualifiedNormalHours) + (assessmentCount * rates.thermalCameraUseCostPerAssessment)
      })()
    },
    {
      id: 'RW_5',
      description: 'Daily Site Monitoring & Moisture Logging',
      qty: dryingDuration,
      unit: 'Day',
      labour: {
        qualified: { hours: dryingDuration, rate: rates.qualifiedTechnicianNormalHours }
      },
      subtotal: dryingDuration * rates.qualifiedTechnicianNormalHours
    }
  ]

  // Add Class 4 drying if needed
  if (needsClass4 && hasYellowTongue) {
    lineItems.push({
      id: 'RW_6',
      description: 'Drying Protocol — Yellow Tongue Sandwich Drying',
      qty: 1,
      unit: 'Application',
      labour: {
        masterQualified: { hours: 12, rate: rates.masterQualifiedNormalHours },
        qualified: { hours: 8, rate: rates.qualifiedTechnicianNormalHours }
      },
      equipment: {
        injectionSystem: { qty: 1, days: dryingDuration, rate: rates.injectionDryingSystemDailyRate }
      },
      subtotal: (12 * rates.masterQualifiedNormalHours) + (8 * rates.qualifiedTechnicianNormalHours) + (dryingDuration * rates.injectionDryingSystemDailyRate)
    })
  }

  // Chemical treatment - use actual data from tier3, analysis, or report
  const chemicalType = tier3?.T3_Q3_chemicalTreatment || 
                      analysis?.chemicalTreatment || 
                      (hasMould ? 'Mould remediation treatment' : 
                       hasBiohazard ? 'Biohazard treatment' : 
                       'Standard antimicrobial treatment')
  let chemicalRate = rates.antimicrobialTreatmentRate
  if (chemicalType.includes('mould')) {
    chemicalRate = rates.mouldRemediationTreatmentRate
  } else if (chemicalType.includes('Biohazard') || hasBiohazard) {
    chemicalRate = rates.biohazardTreatmentRate
  }

  lineItems.push({
    id: 'RW_7',
    description: 'Antimicrobial Chemical Treatment',
    qty: affectedAreaSqm,
    unit: 'Sqm',
    rate: chemicalRate,
    subtotal: affectedAreaSqm * chemicalRate
  })

  // Equipment collection
  lineItems.push({
    id: 'RW_8',
    description: 'Equipment Collection & Site Cleanup',
    qty: 1,
    unit: 'Removal',
    labour: {
      qualified: { hours: 2, rate: rates.qualifiedTechnicianNormalHours },
      labourer: { hours: 2, rate: rates.labourerNormalHours }
    },
    subtotal: (2 * rates.qualifiedTechnicianNormalHours) + (2 * rates.labourerNormalHours)
  })

  // Final certification
  lineItems.push({
    id: 'RW_9',
    description: 'Final Drying Certification & Report',
    qty: 1,
    unit: 'Certification',
    labour: {
      masterQualified: { hours: 2, rate: rates.masterQualifiedNormalHours }
    },
    subtotal: 2 * rates.masterQualifiedNormalHours
  })

  // Administration fee
  lineItems.push({
    id: 'RW_10',
    description: 'Administration & Documentation Fee',
    qty: 1,
    unit: 'Claim',
    rate: rates.administrationFee,
    subtotal: rates.administrationFee
  })

  // Licensed trades
  const licensedTrades = []
  if (needsPlumber) {
    licensedTrades.push({
      trade: 'Plumbing',
      trigger: 'Burst pipe identified',
      scope: 'Assessment, repair/replacement of damaged pipe, water testing, WaterMark certification',
      costStatus: 'Specialist quote required',
      timeline: '1-3 days (must be completed BEFORE drying begins)'
    })
  }
  if (needsElectrician) {
    licensedTrades.push({
      trade: 'Electrical',
      trigger: 'Outlets/circuits in wet areas',
      scope: 'Safety inspection, circuit testing, outlet replacement if damaged, RCD/RCBO installation',
      costStatus: 'Specialist quote required',
      timeline: '1-2 days (before restoration begins)'
    })
  }
  if (needsBuilder) {
    licensedTrades.push({
      trade: 'Builder/Carpenter',
      trigger: 'Structural damage identified',
      scope: 'Structural assessment, yellow tongue subfloor replacement if needed, wall/ceiling repairs',
      costStatus: 'Specialist quote required',
      timeline: '3-10 days depending on scope'
    })
  }
  if (hasMould) {
    licensedTrades.push({
      trade: 'Mould Remediation (IICRC S520 Certified)',
      trigger: 'Active mould growth detected',
      scope: 'Mould assessment, containment setup, professional remediation, clearance testing',
      costStatus: 'Specialist quote required (can significantly increase claim cost)',
      timeline: '5-14 days depending on extent'
    })
  }
  if (hasAsbestos) {
    licensedTrades.push({
      trade: 'Asbestos Assessment & Abatement',
      trigger: 'Suspected or confirmed asbestos materials',
      scope: 'Licensed assessor confirms presence; licensed abatement contractor safely removes',
      costStatus: 'Specialist quote required (usually $5K–$15K+ depending on extent)',
      timeline: 'Assessment 3-5 days; removal 5-10 days'
    })
  }

  return {
    reportId: report.id,
    claimReference: report.claimReferenceNumber || report.reportNumber,
    date: new Date().toLocaleDateString('en-AU'),
    version: 1,
    lineItems,
    licensedTrades,
    stateInfo,
    waterCategory,
    dryingDuration,
    affectedAreaSqm,
    hasClass4Drying: needsClass4,
    hazards: hazards.filter((h: string) => h !== 'None identified')
  }
}

function calculateRW3Subtotal(rates: any, airMovers: number, dehumidifiers: number, afd: number, days: number): number {
  const labour = (4 * rates.masterQualifiedNormalHours) + (6 * rates.qualifiedTechnicianNormalHours)
  const equipment = (airMovers * days * rates.airMoverAxialDailyRate) +
                   (dehumidifiers * days * rates.dehumidifierLGRDailyRate) +
                   (afd * days * rates.afdUnitLargeDailyRate)
  return labour + equipment
}

// Build the complete scope of works document server-side with exact values
function buildScopeOfWorksDocument(scopeData: any): string {
  // Format line items with actual calculations
  const formatLineItems = (items: any[]) => {
    let output = ''
    items.forEach((item: any, index: number) => {

      output += `\n## ${item.id}: ${item.description}\n\n`
      output += `- **Qty:** ${item.qty}\n`
      output += `- **Unit:** ${item.unit}\n`
      
      // Calculate effective rate - use direct rate if available, otherwise calculate from subtotal/qty
      let effectiveRate = 0
      if (item.rate !== undefined && !item.labour && !item.equipment) {
        // Simple item with direct rate
        effectiveRate = Number(item.rate) || 0
      } else {
        // Complex item - calculate rate from subtotal divided by quantity
        const subtotal = Number(item.subtotal) || 0
        const qty = Number(item.qty) || 1
        effectiveRate = qty > 0 ? subtotal / qty : subtotal
      }
      
      // Always show rate
      output += `- **Rate:** $${effectiveRate.toFixed(2)}\n`
      
      // Format labour if present
      if (item.labour) {
        output += `- **Labour:**\n`
        if (item.labour.masterQualified) {
          const hours = Number(item.labour.masterQualified.hours) || 0
          const rate = Number(item.labour.masterQualified.rate) || 0
          const subtotal = hours * rate
          output += `  - Master Qualified: ${hours} hrs @ $${rate.toFixed(2)}/hr = $${subtotal.toFixed(2)}\n`
        }
        if (item.labour.qualified) {
          const hours = Number(item.labour.qualified.hours) || 0
          const rate = Number(item.labour.qualified.rate) || 0
          const subtotal = hours * rate
          output += `  - Qualified: ${hours} hrs @ $${rate.toFixed(2)}/hr = $${subtotal.toFixed(2)}\n`
        }
        if (item.labour.labourer) {
          const hours = Number(item.labour.labourer.hours) || 0
          const rate = Number(item.labour.labourer.rate) || 0
          const subtotal = hours * rate
          output += `  - Labourer: ${hours} hrs @ $${rate.toFixed(2)}/hr = $${subtotal.toFixed(2)}\n`
        }
      }
      
      // Format equipment if present
      if (item.equipment) {
        output += `- **Equipment:**\n`
        if (item.equipment.airMovers) {
          const qty = Number(item.equipment.airMovers.qty) || 0
          const days = Number(item.equipment.airMovers.days) || 0
          const rate = Number(item.equipment.airMovers.rate) || 0
          const subtotal = qty * days * rate
          output += `  - Air Movers: ${qty} units × ${days} days @ $${rate.toFixed(2)}/unit/day = $${subtotal.toFixed(2)}\n`
        }
        if (item.equipment.dehumidifiers) {
          const qty = Number(item.equipment.dehumidifiers.qty) || 0
          const days = Number(item.equipment.dehumidifiers.days) || 0
          const rate = Number(item.equipment.dehumidifiers.rate) || 0
          const subtotal = qty * days * rate
          output += `  - Dehumidifiers: ${qty} units × ${days} days @ $${rate.toFixed(2)}/unit/day = $${subtotal.toFixed(2)}\n`
        }
        if (item.equipment.afd) {
          const qty = Number(item.equipment.afd.qty) || 0
          const days = Number(item.equipment.afd.days) || 0
          const rate = Number(item.equipment.afd.rate) || 0
          const subtotal = qty * days * rate
          output += `  - AFD: ${qty} units × ${days} days @ $${rate.toFixed(2)}/unit/day = $${subtotal.toFixed(2)}\n`
        }
        if (item.equipment.thermalCamera) {
          const qty = Number(item.equipment.thermalCamera.qty) || 0
          const rate = Number(item.equipment.thermalCamera.rate) || 0
          const subtotal = qty * rate
          output += `  - Thermal Camera: ${qty} assessments @ $${rate.toFixed(2)}/assessment = $${subtotal.toFixed(2)}\n`
        }
        if (item.equipment.injectionSystem) {
          const qty = Number(item.equipment.injectionSystem.qty) || 0
          const days = Number(item.equipment.injectionSystem.days) || 0
          const rate = Number(item.equipment.injectionSystem.rate) || 0
          const subtotal = qty * days * rate
          output += `  - Injection Drying System: ${qty} units × ${days} days @ $${rate.toFixed(2)}/unit/day = $${subtotal.toFixed(2)}\n`
        }
      }
      
      const subtotal = Number(item.subtotal) || 0
      output += `- **Subtotal:** $${subtotal.toFixed(2)}\n\n`
    })
    return output
  }

  // Format licensed trades
  const formatLicensedTrades = (trades: any[]) => {
    if (!trades || trades.length === 0) {
      return 'No licensed trades required for this scope.'
    }
    return trades.map((trade: any) => {
      return `### ${trade.trade}
- **Trigger:** ${trade.trigger}
- **Scope:** ${trade.scope}
- **Cost Status:** ${trade.costStatus}
- **Timeline:** ${trade.timeline}
`
    }).join('\n')
  }

  // Build complete document
  let document = `# PRELIMINARY SCOPE OF WORKS — NOT FINAL ESTIMATE

Based on: Inspection Report ${scopeData.claimReference || 'Reference'}
Date: ${scopeData.date}
Version: ${scopeData.version}

# SECTION 1: REMEDIATION PHASES

## PHASE 1: Emergency Response & Stabilisation
- **Duration:** Day 0–1
- **Activities:** Site assessment, standing water extraction, initial equipment deployment, moisture/thermal imaging, site signage, client notification, authority notifications
- **Deliverable:** Equipment operational; standing water removed

## PHASE 2: Drying & Monitoring
- **Duration:** Days 1–${scopeData.dryingDuration} (${scopeData.hasClass4Drying ? 'Class 4' : 'standard'})
- **Activities:** Continuous equipment operation, daily moisture monitoring, thermal imaging, client check-ins, containment management, air quality monitoring
- **Deliverable:** Moisture levels approaching acceptable

## PHASE 3: Validation & Equipment Removal
- **Duration:** Day ${scopeData.dryingDuration}–${scopeData.dryingDuration + 1}
- **Activities:** Final moisture testing, visual inspection, certification, equipment collection, site cleanup, documentation
- **Deliverable:** Restoration works complete

## PHASE 4: Licensed Trades & Building Repairs (Outside Restoration Scope)
- **Duration:** Variable
- **Activities:** ${scopeData.licensedTrades.map((t: any) => t.trade).join(', ') || 'None required'}
- **Deliverable:** Building code compliance; structural integrity restored

## PHASE 5: Contents Restoration (If Applicable)
- **Duration:** Variable
- **Activities:** Carpet cleaning/replacement, furniture restoration, appliance testing, contents itemisation
- **Deliverable:** Contents restored to pre-loss condition

# SECTION 2: RESTORATION WORKS ONLY

${formatLineItems(scopeData.lineItems)}

# SECTION 3: LICENSED TRADES REQUIRED

${formatLicensedTrades(scopeData.licensedTrades)}

# SECTION 4: INSURANCE CLAIM BREAKDOWN

## BUILDING CLAIM (Structural & Systems)
- Water damage to structure
- Restoration services
${scopeData.hasClass4Drying ? '- Yellow tongue subfloor replacement (if beyond recovery)' : ''}
${scopeData.licensedTrades.filter((t: any) => ['Plumbing', 'Electrical', 'Builder/Carpenter'].includes(t.trade)).map((t: any) => `- ${t.trade} repair/replacement`).join('\n') || ''}

## CONTENTS CLAIM (Personal Property)
- Carpets and flooring coverings
- Furniture and textiles
- Electrical appliances
- Personal items

## ADDITIONAL LIVING EXPENSES (if property uninhabitable)
- Temporary accommodation
- Meals and personal care
- Storage for displaced contents

# SECTION 5: COORDINATION AND SEQUENCING NOTES

Critical sequencing information:
${scopeData.licensedTrades.some((t: any) => t.trade === 'Plumbing') ? '- Plumbing must be completed BEFORE drying begins' : ''}
${scopeData.licensedTrades.some((t: any) => t.trade === 'Electrical') ? '- Electrical clearance required BEFORE equipment activation' : ''}
${scopeData.hasClass4Drying ? '- Class 4 drying: Specialist assessment takes priority' : ''}
${scopeData.licensedTrades.some((t: any) => t.trade.includes('Mould')) ? '- Mould remediation: Work stops immediately; restoration resumes post-clearance' : ''}
${scopeData.licensedTrades.some((t: any) => t.trade.includes('Asbestos')) ? '- Asbestos abatement: All work suspended; WorkSafe clearance mandatory' : ''}
- Building repairs: May occur concurrently with final drying phase
- Contents restoration: Final phase after building is dry

# SECTION 6: CLIENT EDIT FIELDS

Note: All line items, quantities, rates, and calculations can be edited by the admin before finalising. System maintains calculation formulas but allows manual override.
`

  return document
}

// Legacy function - kept for reference but not used
function buildScopeOfWorksPrompt(scopeData: any): string {
  return `Generate a comprehensive Scope of Works document for RestoreAssist with the following structure:

# SCOPE OF WORKS DATA

## Header Information
- Title: PRELIMINARY SCOPE OF WORKS — NOT FINAL ESTIMATE
- Based on: Inspection Report ${scopeData.claimReference || 'Reference'}
- Date: ${scopeData.date}
- Version: ${scopeData.version}

## Restoration Works Line Items
${JSON.stringify(scopeData.lineItems, null, 2)}

## Licensed Trades Required
${JSON.stringify(scopeData.licensedTrades, null, 2)}

## State Information
${scopeData.stateInfo ? `${scopeData.stateInfo.name} - ${scopeData.stateInfo.buildingAuthority}` : 'Not specified'}

## Key Details
- Water Category: ${scopeData.waterCategory}
- Drying Duration: ${scopeData.dryingDuration} days
- Affected Area: ${scopeData.affectedAreaSqm} sqm
- Class 4 Drying: ${scopeData.hasClass4Drying ? 'Yes' : 'No'}
- Hazards: ${scopeData.hazards.join(', ') || 'None'}

# DOCUMENT STRUCTURE REQUIREMENTS

Generate a comprehensive Scope of Works document with ALL of the following sections:

## HEADER
- "PRELIMINARY SCOPE OF WORKS — NOT FINAL ESTIMATE"
- Based on: [Inspection Report Reference]
- Date: [today's date]
- Version: [1.0]

## SECTION 1: REMEDIATION PHASES

### PHASE 1: Emergency Response & Stabilisation
- Duration: Day 0–1
- Activities: Site assessment, standing water extraction, initial equipment deployment, moisture/thermal imaging, site signage, client notification, authority notifications
- Deliverable: Equipment operational; standing water removed

### PHASE 2: Drying & Monitoring
- Duration: Days 1–${scopeData.dryingDuration} (${scopeData.hasClass4Drying ? 'Class 4' : 'standard'})
- Activities: Continuous equipment operation, daily moisture monitoring, thermal imaging, client check-ins, containment management, air quality monitoring
- Deliverable: Moisture levels approaching acceptable

### PHASE 3: Validation & Equipment Removal
- Duration: Day ${scopeData.dryingDuration}–${scopeData.dryingDuration + 1}
- Activities: Final moisture testing, visual inspection, certification, equipment collection, site cleanup, documentation
- Deliverable: Restoration works complete

### PHASE 4: Licensed Trades & Building Repairs (Outside Restoration Scope)
- Duration: Variable
- Activities: ${scopeData.licensedTrades.map((t: any) => t.trade).join(', ') || 'None required'}
- Deliverable: Building code compliance; structural integrity restored

### PHASE 5: Contents Restoration (If Applicable)
- Duration: Variable
- Activities: Carpet cleaning/replacement, furniture restoration, appliance testing, contents itemisation
- Deliverable: Contents restored to pre-loss condition

## SECTION 2: RESTORATION WORKS ONLY

List each line item (RW_1 through RW_10) with:
- Description
- Quantity
- Unit
- Rate (from pricing configuration)
- Subtotal (calculated)

Include labour breakdowns and equipment breakdowns where applicable.

## SECTION 3: LICENSED TRADES REQUIRED

${scopeData.licensedTrades.length > 0 
  ? `For each trade, include:
- Trade name
- Trigger condition
- Scope of work
- Cost Status: Specialist quote required
- Timeline
- Notes` 
  : 'No licensed trades required for this scope.'}

## SECTION 4: INSURANCE CLAIM BREAKDOWN

### BUILDING CLAIM (Structural & Systems)
- Water damage to structure
- Restoration services
- ${scopeData.hasClass4Drying ? 'Yellow tongue subfloor replacement (if beyond recovery)' : ''}
- ${scopeData.licensedTrades.filter((t: any) => ['Plumbing', 'Electrical', 'Builder/Carpenter'].includes(t.trade)).map((t: any) => t.trade + ' repair/replacement').join(', ') || ''}

### CONTENTS CLAIM (Personal Property)
- Carpets and flooring coverings
- Furniture and textiles
- Electrical appliances
- Personal items

### ADDITIONAL LIVING EXPENSES (if property uninhabitable)
- Temporary accommodation
- Meals and personal care
- Storage for displaced contents

## SECTION 5: COORDINATION AND SEQUENCING NOTES

Critical sequencing information:
${scopeData.licensedTrades.some((t: any) => t.trade === 'Plumbing') ? '- Plumbing must be completed BEFORE drying begins' : ''}
${scopeData.licensedTrades.some((t: any) => t.trade === 'Electrical') ? '- Electrical clearance required BEFORE equipment activation' : ''}
${scopeData.hasClass4Drying ? '- Class 4 drying: Specialist assessment takes priority' : ''}
${scopeData.licensedTrades.some((t: any) => t.trade.includes('Mould')) ? '- Mould remediation: Work stops immediately; restoration resumes post-clearance' : ''}
${scopeData.licensedTrades.some((t: any) => t.trade.includes('Asbestos')) ? '- Asbestos abatement: All work suspended; WorkSafe clearance mandatory' : ''}
- Building repairs: May occur concurrently with final drying phase
- Contents restoration: Final phase after building is dry

## SECTION 6: CLIENT EDIT FIELDS

Note: All line items, quantities, rates, and calculations can be edited by the admin before finalising.

Format the document professionally with clear sections, proper formatting, and all calculations displayed.`
}

function extractWaterCategory(waterSource: string): string {
  if (!waterSource) return 'Category 1'
  if (waterSource.includes('Category 2') || waterSource.includes('grey water')) return 'Category 2'
  if (waterSource.includes('Category 3') || waterSource.includes('contaminated') || waterSource.includes('Sewage') || waterSource.includes('biohazard')) return 'Category 3'
  return 'Category 1'
}

