import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { detectStateFromPostcode, getStateInfo } from '@/lib/state-detection'
import { tryClaudeModels } from '@/lib/anthropic-models'

// POST - Generate Cost Estimation document
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

    // Get the complete report with all data
    const report = await prisma.report.findUnique({
      where: { id: reportId, userId: user.id }
    })

    if (!report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      )
    }

    // Get scope of works data if available
    const scopeData = report.scopeOfWorksData 
      ? JSON.parse(report.scopeOfWorksData) 
      : null

    // Parse all stored data
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

    // Get pricing configuration
    const pricingConfig = user.pricingConfig

    if (!pricingConfig) {
      return NextResponse.json(
        { error: 'Pricing configuration not found. Please configure your pricing in Settings.' },
        { status: 400 }
      )
    }

    // Detect state
    const stateCode = detectStateFromPostcode(report.propertyPostcode || '')
    const stateInfo = getStateInfo(stateCode)

    // Get user's Anthropic API integration
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

    // Build cost estimation data structure
    const costData = buildCostEstimationData({
      report,
      analysis,
      tier1,
      tier2,
      tier3,
      pricingConfig,
      stateInfo,
      scopeData
    })

    // Generate the document - build it server-side with exact values, use AI only for narrative enhancement
    const costDocument = buildCostEstimationDocument(costData)

    // Save the generated document and data
    await prisma.report.update({
      where: { id: reportId },
      data: {
        costEstimationDocument: costDocument,
        costEstimationData: JSON.stringify(costData)
      }
    })

    const updatedReport = await prisma.report.findUnique({
      where: { id: reportId }
    })

    return NextResponse.json({ 
      report: updatedReport,
      costEstimation: {
        document: costDocument,
        data: costData
      },
      message: 'Cost Estimation generated successfully'
    })
  } catch (error) {
    console.error('Error generating cost estimation:', error)
    return NextResponse.json(
      { error: 'Failed to generate cost estimation' },
      { status: 500 }
    )
  }
}

function buildCostEstimationData(data: {
  report: any
  analysis: any
  tier1: any
  tier2: any
  tier3: any
  pricingConfig: any
  stateInfo: any
  scopeData: any
}) {
  const { report, tier1, tier2, tier3, pricingConfig, stateInfo, scopeData } = data

  // Extract information
  const timelineRequirements = tier3?.T3_Q1_timelineRequirements || 'No specific deadline'
  const isEmergency = timelineRequirements.includes('ASAP')
  const dryingPreferences = tier3?.T3_Q2_dryingPreferences || 'Balanced'
  const isSpeedPriority = dryingPreferences.includes('Speed priority')
  
  const materials = tier1?.T1_Q6_materialsAffected || []
  const hasYellowTongue = materials.some((m: string) => m.includes('Yellow tongue'))
  const class4Drying = tier3?.T3_Q5_class4DryingAssessment || 'Uncertain'
  const needsClass4 = class4Drying.includes('Class 4') || class4Drying.includes('Class 3 or 4')
  
  const hazards = tier1?.T1_Q7_hazards || []
  const hasAsbestos = hazards.some((h: string) => h.includes('asbestos'))
  const hasMould = hazards.some((h: string) => h.includes('mould'))
  const hasBiohazard = hazards.some((h: string) => h.includes('Biohazard'))
  
  const affectedArea = tier3?.T3_Q4_totalAffectedArea || 'Not specified'
  const areaMatch = affectedArea.match(/(\d+)\s*sqm/i) || affectedArea.match(/=\s*(\d+)/)
  const affectedAreaSqm = areaMatch ? parseFloat(areaMatch[1]) : 125

  const equipmentDeployed = tier2?.T2_Q3_equipmentDeployed || ''
  const airMoversMatch = equipmentDeployed.match(/(\d+)\s*air\s*mover/i)
  const dehumidifiersMatch = equipmentDeployed.match(/(\d+)\s*dehumidifier/i)
  const afdMatch = equipmentDeployed.match(/(\d+)\s*afd/i)
  
  const airMoversQty = airMoversMatch ? parseInt(airMoversMatch[1]) : 18
  const dehumidifiersQty = dehumidifiersMatch ? parseInt(dehumidifiersMatch[1]) : 4
  const afdQty = afdMatch ? parseInt(afdMatch[1]) : 2
  
  const dryingDuration = needsClass4 ? 14 : 7

  // Build cost categories
  const categories: any = {}

  // Labour - Emergency Response & Setup
  categories.emergencyResponse = {
    name: 'Labour — Emergency Response & Setup (Day 0–1)',
    lineItems: [
      {
        description: 'Master Qualified Technician — Site assessment, equipment staging, hazard identification',
        hours: 4,
        rate: pricingConfig.masterQualifiedNormalHours,
        subtotal: 4 * pricingConfig.masterQualifiedNormalHours
      },
      {
        description: 'Qualified Technician — Equipment setup, moisture readings, client briefing',
        hours: 6,
        rate: pricingConfig.qualifiedTechnicianNormalHours,
        subtotal: 6 * pricingConfig.qualifiedTechnicianNormalHours
      },
      {
        description: 'Labourer — Equipment movement, containment barriers, debris management',
        hours: 4,
        rate: pricingConfig.labourerNormalHours,
        subtotal: 4 * pricingConfig.labourerNormalHours
      }
    ],
    total: (4 * pricingConfig.masterQualifiedNormalHours) + 
           (6 * pricingConfig.qualifiedTechnicianNormalHours) + 
           (4 * pricingConfig.labourerNormalHours)
  }

  // Labour - Ongoing Monitoring
  categories.ongoingMonitoring = {
    name: 'Labour — Ongoing Monitoring (Days 1–7)',
    lineItems: [
      {
        description: 'Qualified Technician — Daily site visits, moisture meter readings, equipment checks',
        hours: dryingDuration,
        rate: pricingConfig.qualifiedTechnicianNormalHours,
        subtotal: dryingDuration * pricingConfig.qualifiedTechnicianNormalHours
      }
    ],
    total: dryingDuration * pricingConfig.qualifiedTechnicianNormalHours
  }

  // Labour - Drying Protocol Specialist (if Class 3/4)
  if (needsClass4) {
    categories.dryingProtocol = {
      name: 'Labour — Drying Protocol Specialist (Class 3/4)',
      lineItems: [
        {
          description: 'Master Qualified Technician — Sandwich drying setup, injection system configuration',
          hours: 12,
          rate: pricingConfig.masterQualifiedNormalHours,
          subtotal: 12 * pricingConfig.masterQualifiedNormalHours
        },
        {
          description: 'Qualified Technician — Setup support, monitoring',
          hours: 8,
          rate: pricingConfig.qualifiedTechnicianNormalHours,
          subtotal: 8 * pricingConfig.qualifiedTechnicianNormalHours
        }
      ],
      total: (12 * pricingConfig.masterQualifiedNormalHours) + 
             (8 * pricingConfig.qualifiedTechnicianNormalHours)
    }
  }

  // Labour - Final Validation
  categories.finalValidation = {
    name: 'Labour — Final Validation & Collection (Day 7–8)',
    lineItems: [
      {
        description: 'Master Qualified Technician — Final moisture assessment, thermal imaging, certification',
        hours: 2,
        rate: pricingConfig.masterQualifiedNormalHours,
        subtotal: 2 * pricingConfig.masterQualifiedNormalHours
      },
      {
        description: 'Qualified Technician + Labourer — Equipment collection, site cleanup',
        hours: 4,
        rate: (pricingConfig.qualifiedTechnicianNormalHours + pricingConfig.labourerNormalHours) / 2,
        subtotal: 2 * pricingConfig.qualifiedTechnicianNormalHours + 2 * pricingConfig.labourerNormalHours
      }
    ],
    total: (2 * pricingConfig.masterQualifiedNormalHours) + 
           (2 * pricingConfig.qualifiedTechnicianNormalHours) + 
           (2 * pricingConfig.labourerNormalHours)
  }

  // After-hours (if emergency)
  if (isEmergency) {
    categories.afterHours = {
      name: 'Labour — After-Hours or Weekend (Emergency)',
      lineItems: [
        {
          description: 'Master Qualified Technician — Saturday rates',
          hours: 0, // To be filled by client
          rate: pricingConfig.masterQualifiedSaturday,
          subtotal: 0
        },
        {
          description: 'Qualified Technician — Saturday rates',
          hours: 0,
          rate: pricingConfig.qualifiedTechnicianSaturday,
          subtotal: 0
        }
      ],
      total: 0
    }
  }

  // Call-Out Fees
  categories.callOut = {
    name: 'Call-Out Fees',
    lineItems: [
      {
        description: 'Minimal Call-Out Fee',
        qty: 1,
        rate: pricingConfig.callOutFee,
        subtotal: pricingConfig.callOutFee
      }
    ],
    total: pricingConfig.callOutFee
  }

  // Equipment Rental - Dehumidifiers
  categories.dehumidifiers = {
    name: 'Equipment Rental — Dehumidifiers',
    lineItems: [
      {
        description: 'LGR Dehumidifier (Large)',
        qty: dehumidifiersQty,
        days: dryingDuration,
        dailyRate: pricingConfig.dehumidifierLGRDailyRate,
        subtotal: dehumidifiersQty * dryingDuration * pricingConfig.dehumidifierLGRDailyRate
      }
    ],
    total: dehumidifiersQty * dryingDuration * pricingConfig.dehumidifierLGRDailyRate
  }

  if (isSpeedPriority) {
    categories.dehumidifiers.lineItems.push({
      description: 'Desiccant Dehumidifier (Speed Priority)',
      qty: 0, // To be determined
      days: dryingDuration,
      dailyRate: pricingConfig.dehumidifierDesiccantDailyRate,
      subtotal: 0
    })
  }

  // Equipment Rental - Air Movers
  categories.airMovers = {
    name: 'Equipment Rental — Air Movers',
    lineItems: [
      {
        description: 'Axial Air Mover',
        qty: airMoversQty,
        days: dryingDuration,
        dailyRate: pricingConfig.airMoverAxialDailyRate,
        subtotal: airMoversQty * dryingDuration * pricingConfig.airMoverAxialDailyRate
      }
    ],
    total: airMoversQty * dryingDuration * pricingConfig.airMoverAxialDailyRate
  }

  // Equipment Rental - AFD
  categories.afd = {
    name: 'Equipment Rental — Air Filtration (AFD/HEPA)',
    lineItems: [
      {
        description: 'AFD Unit (Large 500 CFM)',
        qty: afdQty,
        days: dryingDuration,
        dailyRate: pricingConfig.afdUnitLargeDailyRate,
        subtotal: afdQty * dryingDuration * pricingConfig.afdUnitLargeDailyRate
      }
    ],
    total: afdQty * dryingDuration * pricingConfig.afdUnitLargeDailyRate
  }

  // Equipment Rental - Extraction
  categories.extraction = {
    name: 'Equipment Rental — Extraction',
    lineItems: [
      {
        description: 'Truck-Mounted Extraction Unit',
        hours: 4,
        rate: pricingConfig.extractionTruckMountedHourlyRate,
        subtotal: 4 * pricingConfig.extractionTruckMountedHourlyRate
      }
    ],
    total: 4 * pricingConfig.extractionTruckMountedHourlyRate
  }

  // Equipment Rental - Drying Systems (if Class 4)
  if (needsClass4 && hasYellowTongue) {
    categories.dryingSystems = {
      name: 'Equipment Rental — Drying Systems (Class 3/4)',
      lineItems: [
        {
          description: 'Injection Drying System (thermal mats, injection equipment)',
          qty: 1,
          days: dryingDuration,
          dailyRate: pricingConfig.injectionDryingSystemDailyRate,
          subtotal: dryingDuration * pricingConfig.injectionDryingSystemDailyRate
        }
      ],
      total: dryingDuration * pricingConfig.injectionDryingSystemDailyRate
    }
  }

  // Thermal Imaging
  categories.thermalImaging = {
    name: 'Thermal Imaging & Moisture Assessment',
    lineItems: [
      {
        description: 'Thermal Camera Claim Use Cost — 3 assessments (Days 0, 3, 7)',
        qty: 3,
        rate: pricingConfig.thermalCameraUseCostPerAssessment,
        subtotal: 3 * pricingConfig.thermalCameraUseCostPerAssessment
      }
    ],
    total: 3 * pricingConfig.thermalCameraUseCostPerAssessment
  }

  // Chemical Treatment
  const chemicalType = tier3?.T3_Q3_chemicalTreatment || 'Standard antimicrobial treatment'
  let chemicalRate = pricingConfig.antimicrobialTreatmentRate
  if (chemicalType.includes('mould')) {
    chemicalRate = pricingConfig.mouldRemediationTreatmentRate
  } else if (chemicalType.includes('Biohazard') || hasBiohazard) {
    chemicalRate = pricingConfig.biohazardTreatmentRate
  }

  categories.chemicalTreatment = {
    name: 'Chemical Treatment',
    lineItems: [
      {
        description: 'Anti-microbial Treatment',
        sqm: affectedAreaSqm,
        ratePerSqm: pricingConfig.antimicrobialTreatmentRate,
        subtotal: affectedAreaSqm * pricingConfig.antimicrobialTreatmentRate
      }
    ],
    total: affectedAreaSqm * pricingConfig.antimicrobialTreatmentRate
  }

  if (hasMould) {
    categories.chemicalTreatment.lineItems.push({
      description: 'Mould Remediation Treatment',
      sqm: affectedAreaSqm,
      ratePerSqm: pricingConfig.mouldRemediationTreatmentRate,
      subtotal: affectedAreaSqm * pricingConfig.mouldRemediationTreatmentRate
    })
    categories.chemicalTreatment.total += affectedAreaSqm * pricingConfig.mouldRemediationTreatmentRate
  }

  if (hasBiohazard) {
    categories.chemicalTreatment.lineItems.push({
      description: 'Bio-Hazard Treatment',
      sqm: affectedAreaSqm,
      ratePerSqm: pricingConfig.biohazardTreatmentRate,
      subtotal: affectedAreaSqm * pricingConfig.biohazardTreatmentRate
    })
    categories.chemicalTreatment.total += affectedAreaSqm * pricingConfig.biohazardTreatmentRate
  }

  // Administration Fee
  categories.administration = {
    name: 'Administration Fee',
    lineItems: [
      {
        description: 'Claim Processing, Documentation, Report Generation',
        qty: 1,
        rate: pricingConfig.administrationFee,
        subtotal: pricingConfig.administrationFee
      }
    ],
    total: pricingConfig.administrationFee
  }

  // Calculate totals
  const totalLabour = Object.values(categories)
    .filter((c: any) => c.name.includes('Labour'))
    .reduce((sum: number, c: any) => sum + (c.total || 0), 0)
  
  const totalEquipment = Object.values(categories)
    .filter((c: any) => c.name.includes('Equipment'))
    .reduce((sum: number, c: any) => sum + (c.total || 0), 0)
  
  const totalChemicals = categories.chemicalTreatment?.total || 0
  const totalAdmin = categories.administration?.total || 0
  const totalCallOut = categories.callOut?.total || 0
  const totalThermal = categories.thermalImaging?.total || 0

  const subtotal = totalLabour + totalEquipment + totalChemicals + totalAdmin + totalCallOut + totalThermal
  const gst = subtotal * 0.10 // 10% GST
  const totalIncGST = subtotal + gst

  // Industry comparison
  const industryAverage = { min: 6500, max: 12000 }
  const costAnalysis = subtotal < industryAverage.min 
    ? 'Below average (client may offer discount/aggressive pricing)'
    : subtotal > industryAverage.max
    ? 'Above average (may warrant specialist services or complex claim justification)'
    : 'Within range (market standard)'

  // Cost drivers
  const costDrivers = []
  if (totalEquipment > totalLabour) {
    costDrivers.push(`${airMoversQty} air movers × ${dryingDuration} days (most significant equipment cost)`)
  }
  if (needsClass4) {
    costDrivers.push('Sandwich drying system rental (Class 4 complexity)')
  }
  if (isEmergency) {
    costDrivers.push('After-hours Saturday call-out premium')
  }

  // Flagged items
  const flaggedItems = []
  if (needsClass4) {
    flaggedItems.push({
      flag: 'Class 4 Drying Flagged',
      reason: 'Tier 1/2 responses indicated possible yellow tongue or structural saturation',
      action: 'Qualified Master Technician must assess on-site before final quote. System provides placeholder; actual cost TBD.'
    })
  }
  if (hasAsbestos || hasMould || hasBiohazard) {
    flaggedItems.push({
      flag: 'Hazard Cost TBD',
      reason: `${hasAsbestos ? 'Asbestos' : ''} ${hasMould ? 'Mould' : ''} ${hasBiohazard ? 'Biohazard' : ''} suspected or confirmed`,
      action: 'Specialist assessment required. Cannot estimate until specialist provides quote. Insurance pre-approval recommended.'
    })
  }
  if (scopeData?.licensedTrades?.length > 0) {
    flaggedItems.push({
      flag: 'Multi-Phase Timeline',
      reason: 'Licensed trades (plumbing, electrical) must be coordinated before drying begins',
      action: 'Verify availability with plumber/electrician. Delays may extend equipment rental costs.'
    })
  }

  return {
    reportId: report.id,
    claimReference: report.claimReferenceNumber || report.reportNumber,
    date: new Date().toLocaleDateString('en-AU'),
    version: 1,
    categories,
    totals: {
      totalLabour,
      totalEquipment,
      totalChemicals,
      totalAdmin: totalAdmin + totalCallOut + totalThermal,
      subtotal,
      gst,
      totalIncGST
    },
    industryComparison: {
      average: industryAverage,
      estimated: subtotal,
      analysis: costAnalysis
    },
    costDrivers,
    flaggedItems,
    affectedAreaSqm,
    dryingDuration,
    needsClass4,
    hasHazards: hasAsbestos || hasMould || hasBiohazard,
    stateInfo
  }
}

// Build the complete cost estimation document server-side with exact values
function buildCostEstimationDocument(costData: any): string {
  // Format categories as complete tables with exact values
  const formatCategories = (categories: any) => {
    let output = ''
    Object.values(categories).forEach((cat: any) => {
      output += `\n## ${cat.name}\n\n`
      
      // Determine table structure based on category type
      const hasDays = cat.lineItems.some((item: any) => item.days)
      const hasSqm = cat.lineItems.some((item: any) => item.sqm)
      
      if (hasDays) {
        output += `| Description | Qty | Days | Daily Rate | Subtotal |\n`
        output += `|-------------|-----|------|------------|----------|\n`
        cat.lineItems.forEach((item: any) => {
          const qty = item.qty || 1
          const days = item.days || 1
          const rate = item.dailyRate || 0
          const subtotal = item.subtotal || 0
          output += `| ${item.description} | ${qty} | ${days} | $${rate.toFixed(2)} | $${subtotal.toFixed(2)} |\n`
        })
      } else if (hasSqm) {
        output += `| Description | Sqm | Rate per Sqm | Subtotal |\n`
        output += `|-------------|-----|--------------|----------|\n`
        cat.lineItems.forEach((item: any) => {
          const sqm = item.sqm || 0
          const rate = item.ratePerSqm || 0
          const subtotal = item.subtotal || 0
          output += `| ${item.description} | ${sqm} | $${rate.toFixed(2)} | $${subtotal.toFixed(2)} |\n`
        })
      } else {
        // Default: Hours/Qty, Rate, Subtotal
        const hasHours = cat.lineItems.some((item: any) => item.hours)
        if (hasHours) {
          output += `| Description | Hours | Rate | Subtotal |\n`
          cat.lineItems.forEach((item: any) => {
            const hours = item.hours || 0
            const rate = item.rate || 0
            const subtotal = item.subtotal || 0
            output += `| ${item.description} | ${hours} | $${rate.toFixed(2)} | $${subtotal.toFixed(2)} |\n`
          })
        } else {
          output += `| Description | Qty | Rate | Subtotal |\n`
          cat.lineItems.forEach((item: any) => {
            const qty = item.qty || 1
            const rate = item.rate || 0
            const subtotal = item.subtotal || 0
            output += `| ${item.description} | ${qty} | $${rate.toFixed(2)} | $${subtotal.toFixed(2)} |\n`
          })
        }
      }
      
      output += `\n**Category Total: $${cat.total.toFixed(2)}**\n\n`
    })
    return output
  }

  // Format flagged items properly - remove duplicates
  const formatFlaggedItems = (items: any[]) => {
    if (!items || items.length === 0) {
      return 'No items flagged for manual review.'
    }
    // Remove duplicates based on flag text
    const uniqueItems = items.filter((item, index, self) => 
      index === self.findIndex((t) => t.flag === item.flag && t.reason === item.reason)
    )
    return uniqueItems.map((item: any) => {
      return `⚠️ **${item.flag}**\n- **Reason:** ${item.reason}\n- **Action Required:** ${item.action}\n`
    }).join('\n')
  }

  // Build complete document with exact values
  let document = `# PRELIMINARY COST ESTIMATION — NOT FINAL ESTIMATE

Based on: Inspection Report & Scope of Works ${costData.claimReference || 'Reference'}
Date: ${costData.date}
Claim Reference: ${costData.claimReference}
Version: ${costData.version}

# SECTION 1: COST BREAKDOWN BY CATEGORY

${formatCategories(costData.categories)}

# SECTION 2: GRAND TOTAL AND COST SUMMARY

- Total Labour Costs (all categories): $${costData.totals.totalLabour.toFixed(2)}
- Total Equipment Rental Costs: $${costData.totals.totalEquipment.toFixed(2)}
- Total Chemical & Treatment Costs: $${costData.totals.totalChemicals.toFixed(2)}
- Total Administrative & Miscellaneous: $${costData.totals.totalAdmin.toFixed(2)}
- ———————————————————
- **SUBTOTAL (Restoration Works): $${costData.totals.subtotal.toFixed(2)}**
- GST (10%): $${costData.totals.gst.toFixed(2)}
- **TOTAL ESTIMATED COST (Restoration Services): $${costData.totals.totalIncGST.toFixed(2)}**

# SECTION 3: COST COMPARISON AND JUSTIFICATION

## Industry Average for Similar Claim
- ${costData.stateInfo?.name || 'Australian'} Water Damage, ${costData.affectedAreaSqm} sqm, ${costData.dryingDuration}-day drying
- Range: $${costData.industryComparison.average.min.toLocaleString()}–$${costData.industryComparison.average.max.toLocaleString()}
- Note: Based on IICRC S500 standard remediation; regional variation applies

## Your Estimated Cost
- Amount: $${costData.totals.subtotal.toFixed(2)}
- Analysis: ${costData.industryComparison.analysis}

## Cost Drivers (Key Line Items)
${costData.costDrivers.length > 0 
  ? costData.costDrivers.map((d: string) => `- ${d}`).join('\n')
  : '- Standard water damage restoration protocol'}

## Value Articulation Statement
This estimate reflects comprehensive water damage restoration per IICRC S500 standards, including 24/7 equipment operation, daily professional monitoring, thermal imaging to detect hidden moisture, and antimicrobial treatment to prevent secondary mould damage. The cost avoids far greater expenses: occupant relocation ($200–$400/night), contents replacement, and structural repairs if moisture damage extends ($50K+).

# SECTION 4: EXCLUSIONS AND NOT INCLUDED

NOT INCLUDED IN THIS ESTIMATE:
- Licensed Trades: Plumbing repair, electrical work, carpentry, mould specialist, asbestos abatement (separate specialist quotes required)
- Contents Restoration: Carpet cleaning/replacement, furniture restoration, appliance repair (if applicable)
- Building Repairs: Structural timber replacement, drywall/plasterboard replacement, painting, flooring re-installation
${costData.needsClass4 ? '- Class 4 Drying (if not explicitly listed): If yellow tongue sandwich drying extends beyond estimate, separate specialist quote required' : ''}
- Insurance Excess: Client responsibility per PDS
- Ongoing Maintenance Post-Restoration: Regular cleaning, preventative treatments beyond initial restoration scope

# SECTION 5: CONDITIONS AND ASSUMPTIONS

THIS ESTIMATE ASSUMES:
- Water source successfully stopped (plumbing repair assumed completed before drying begins)
- Property electrically safe for equipment operation (electrician clearance assumed completed)
- Access to all affected areas unrestricted
- No hazardous materials discovered (if discovered, separate specialist quote required)
- Standard weather conditions (no extreme heat/cold affecting drying timeline)
- Equipment availability at time of loss
- Drying completion within ${costData.dryingDuration} days

# SECTION 6: COST ADJUSTMENT TRIGGERS

TRIGGERS THAT WILL INCREASE COSTS:
${costData.hasHazards ? '- Hazard Discovery (Asbestos, Lead Paint, Mould): Can add $5K–$20K+ depending on extent' : ''}
- Extended Drying Timeline (>${costData.dryingDuration} days): Each additional day adds ~$800–$1,500
${costData.needsClass4 ? '- Class 4 Drying Confirmed: Typically adds $3K–$8K+' : ''}
${costData.flaggedItems.some((f: any) => f.flag && f.flag.includes('Mould')) ? '- Active Mould Growth: Can add $5K–$15K+ depending on spread' : ''}
- Weekend/After-Hours Deployment (Emergency): Can add 20–50% to labour
- Multiple Floors/Significant Water Migration: Add 30–50% to estimate

# SECTION 7: CLIENT EDIT AND CUSTOMISATION FIELDS

Note: All line items, quantities, rates, and calculations can be edited by the admin before finalising. System maintains calculation formulas but allows manual override.

# SECTION 8: FLAGGED ITEMS REQUIRING MANUAL REVIEW

${formatFlaggedItems(costData.flaggedItems || [])}
`

  return document
}

