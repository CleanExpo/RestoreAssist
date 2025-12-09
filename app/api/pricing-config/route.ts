import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET - Retrieve pricing configuration for current user
export async function GET(request: NextRequest) {
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

    // Check if user has a connected API key
    const integrations = await prisma.integration.findMany({
      where: {
        userId: user.id,
        status: 'CONNECTED',
        apiKey: { not: null }
      }
    })

    const hasApiKey = integrations.length > 0

    // Parse custom fields if they exist
    let customFields = null
    if (user.pricingConfig?.customFields) {
      try {
        customFields = JSON.parse(user.pricingConfig.customFields)
      } catch (e) {
        console.error('Error parsing custom fields:', e)
      }
    }

    // If no config exists, return default values
    if (!user.pricingConfig) {
      return NextResponse.json({
        pricingConfig: null,
        defaults: getDefaultPricingConfig(),
        canEdit: true,
        hasApiKey
      })
    }

    return NextResponse.json({ 
      pricingConfig: {
        ...user.pricingConfig,
        customFields
      },
      canEdit: true,
      hasApiKey
    })
  } catch (error) {
    console.error('Error fetching pricing config:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pricing configuration' },
      { status: 500 }
    )
  }
}

// PUT - Create or update pricing configuration
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Users can always update pricing configuration, even after API key is set

    const data = await request.json()

    // Validate required fields
    const requiredFields = [
      'masterQualifiedNormalHours',
      'masterQualifiedSaturday',
      'masterQualifiedSunday',
      'qualifiedTechnicianNormalHours',
      'qualifiedTechnicianSaturday',
      'qualifiedTechnicianSunday',
      'labourerNormalHours',
      'labourerSaturday',
      'labourerSunday',
      'airMoverAxialDailyRate',
      'airMoverCentrifugalDailyRate',
      'dehumidifierLGRDailyRate',
      'dehumidifierDesiccantDailyRate',
      'afdUnitLargeDailyRate',
      'extractionTruckMountedHourlyRate',
      'extractionElectricHourlyRate',
      'injectionDryingSystemDailyRate',
      'antimicrobialTreatmentRate',
      'mouldRemediationTreatmentRate',
      'biohazardTreatmentRate',
      'administrationFee',
      'callOutFee',
      'thermalCameraUseCostPerAssessment'
    ]

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        )
      }
      if (typeof data[field] !== 'number' || data[field] < 0) {
        return NextResponse.json(
          { error: `Invalid value for ${field}: must be a positive number` },
          { status: 400 }
        )
      }
    }

    // Handle custom fields - validate and stringify
    let customFieldsJson = null
    if (data.customFields) {
      // Validate custom fields structure
      const validCategories = ['labour', 'equipment', 'chemical', 'fees']
      const customFieldsObj = data.customFields
      
      for (const category of Object.keys(customFieldsObj)) {
        if (!validCategories.includes(category)) {
          return NextResponse.json(
            { error: `Invalid category: ${category}. Must be one of: ${validCategories.join(', ')}` },
            { status: 400 }
          )
        }
        
        if (!Array.isArray(customFieldsObj[category])) {
          return NextResponse.json(
            { error: `Custom fields for ${category} must be an array` },
            { status: 400 }
          )
        }
        
        for (const field of customFieldsObj[category]) {
          if (!field.name || typeof field.name !== 'string') {
            return NextResponse.json(
              { error: `Each custom field must have a valid name` },
              { status: 400 }
            )
          }
          if (typeof field.value !== 'number' || field.value < 0) {
            return NextResponse.json(
              { error: `Custom field "${field.name}" must have a valid positive number value` },
              { status: 400 }
            )
          }
        }
      }
      
      customFieldsJson = JSON.stringify(customFieldsObj)
    }

    // Upsert pricing configuration
    const pricingConfig = await prisma.companyPricingConfig.upsert({
      where: { userId: user.id },
      update: {
        masterQualifiedNormalHours: data.masterQualifiedNormalHours,
        masterQualifiedSaturday: data.masterQualifiedSaturday,
        masterQualifiedSunday: data.masterQualifiedSunday,
        qualifiedTechnicianNormalHours: data.qualifiedTechnicianNormalHours,
        qualifiedTechnicianSaturday: data.qualifiedTechnicianSaturday,
        qualifiedTechnicianSunday: data.qualifiedTechnicianSunday,
        labourerNormalHours: data.labourerNormalHours,
        labourerSaturday: data.labourerSaturday,
        labourerSunday: data.labourerSunday,
        airMoverAxialDailyRate: data.airMoverAxialDailyRate,
        airMoverCentrifugalDailyRate: data.airMoverCentrifugalDailyRate,
        dehumidifierLGRDailyRate: data.dehumidifierLGRDailyRate,
        dehumidifierDesiccantDailyRate: data.dehumidifierDesiccantDailyRate,
        afdUnitLargeDailyRate: data.afdUnitLargeDailyRate,
        extractionTruckMountedHourlyRate: data.extractionTruckMountedHourlyRate,
        extractionElectricHourlyRate: data.extractionElectricHourlyRate,
        injectionDryingSystemDailyRate: data.injectionDryingSystemDailyRate,
        antimicrobialTreatmentRate: data.antimicrobialTreatmentRate,
        mouldRemediationTreatmentRate: data.mouldRemediationTreatmentRate,
        biohazardTreatmentRate: data.biohazardTreatmentRate,
        administrationFee: data.administrationFee,
        callOutFee: data.callOutFee,
        thermalCameraUseCostPerAssessment: data.thermalCameraUseCostPerAssessment,
        customFields: customFieldsJson,
      },
      create: {
        userId: user.id,
        masterQualifiedNormalHours: data.masterQualifiedNormalHours,
        masterQualifiedSaturday: data.masterQualifiedSaturday,
        masterQualifiedSunday: data.masterQualifiedSunday,
        qualifiedTechnicianNormalHours: data.qualifiedTechnicianNormalHours,
        qualifiedTechnicianSaturday: data.qualifiedTechnicianSaturday,
        qualifiedTechnicianSunday: data.qualifiedTechnicianSunday,
        labourerNormalHours: data.labourerNormalHours,
        labourerSaturday: data.labourerSaturday,
        labourerSunday: data.labourerSunday,
        airMoverAxialDailyRate: data.airMoverAxialDailyRate,
        airMoverCentrifugalDailyRate: data.airMoverCentrifugalDailyRate,
        dehumidifierLGRDailyRate: data.dehumidifierLGRDailyRate,
        dehumidifierDesiccantDailyRate: data.dehumidifierDesiccantDailyRate,
        afdUnitLargeDailyRate: data.afdUnitLargeDailyRate,
        extractionTruckMountedHourlyRate: data.extractionTruckMountedHourlyRate,
        extractionElectricHourlyRate: data.extractionElectricHourlyRate,
        injectionDryingSystemDailyRate: data.injectionDryingSystemDailyRate,
        antimicrobialTreatmentRate: data.antimicrobialTreatmentRate,
        mouldRemediationTreatmentRate: data.mouldRemediationTreatmentRate,
        biohazardTreatmentRate: data.biohazardTreatmentRate,
        administrationFee: data.administrationFee,
        callOutFee: data.callOutFee,
        thermalCameraUseCostPerAssessment: data.thermalCameraUseCostPerAssessment,
        customFields: customFieldsJson,
      }
    })

    // Parse custom fields for response
    let customFields = null
    if (pricingConfig.customFields) {
      try {
        customFields = JSON.parse(pricingConfig.customFields)
      } catch (e) {
        console.error('Error parsing custom fields:', e)
      }
    }

    return NextResponse.json({ 
      pricingConfig: {
        ...pricingConfig,
        customFields
      }
    })
  } catch (error) {
    console.error('Error saving pricing config:', error)
    return NextResponse.json(
      { error: 'Failed to save pricing configuration' },
      { status: 500 }
    )
  }
}

// Helper function to return default pricing values
function getDefaultPricingConfig() {
  return {
    masterQualifiedNormalHours: 85.00,
    masterQualifiedSaturday: 127.50,
    masterQualifiedSunday: 170.00,
    qualifiedTechnicianNormalHours: 65.00,
    qualifiedTechnicianSaturday: 97.50,
    qualifiedTechnicianSunday: 130.00,
    labourerNormalHours: 45.00,
    labourerSaturday: 67.50,
    labourerSunday: 90.00,
    airMoverAxialDailyRate: 25.00,
    airMoverCentrifugalDailyRate: 35.00,
    dehumidifierLGRDailyRate: 45.00,
    dehumidifierDesiccantDailyRate: 65.00,
    afdUnitLargeDailyRate: 40.00,
    extractionTruckMountedHourlyRate: 120.00,
    extractionElectricHourlyRate: 80.00,
    injectionDryingSystemDailyRate: 150.00,
    antimicrobialTreatmentRate: 8.50,
    mouldRemediationTreatmentRate: 15.00,
    biohazardTreatmentRate: 25.00,
    administrationFee: 250.00,
    callOutFee: 150.00,
    thermalCameraUseCostPerAssessment: 75.00
  }
}

