import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Question tiers based on hazard type
const QUESTION_TIERS = {
  WATER: {
    tier1: [
      { id: 'water_category', question: 'What is the water category?', type: 'select', options: ['Category 1', 'Category 2', 'Category 3'] },
      { id: 'water_class', question: 'What is the water class?', type: 'select', options: ['Class 1', 'Class 2', 'Class 3', 'Class 4'] },
      { id: 'affected_area', question: 'What is the affected area (sqm)?', type: 'number' },
      { id: 'source_of_water', question: 'What is the source of water?', type: 'text' }
    ],
    tier2: [
      { id: 'structural_damage', question: 'Describe structural damage', type: 'textarea' },
      { id: 'contents_damage', question: 'Describe contents damage', type: 'textarea' },
      { id: 'hvac_affected', question: 'Is HVAC affected?', type: 'boolean' }
    ],
    tier3: [
      { id: 'safety_hazards', question: 'List safety hazards', type: 'textarea' },
      { id: 'electrical_hazards', question: 'Describe electrical hazards', type: 'textarea' },
      { id: 'microbial_growth', question: 'Is there microbial growth?', type: 'textarea' }
    ]
  },
  FIRE: {
    tier1: [
      { id: 'fire_severity', question: 'What is the fire severity?', type: 'select', options: ['Minor', 'Moderate', 'Severe', 'Total Loss'] },
      { id: 'affected_area', question: 'What is the affected area (sqm)?', type: 'number' },
      { id: 'smoke_damage', question: 'Describe smoke damage extent', type: 'textarea' }
    ],
    tier2: [
      { id: 'structural_damage', question: 'Describe structural damage', type: 'textarea' },
      { id: 'contents_damage', question: 'Describe contents damage', type: 'textarea' },
      { id: 'soot_depth', question: 'Estimate soot depth/coverage', type: 'text' }
    ],
    tier3: [
      { id: 'safety_hazards', question: 'List safety hazards', type: 'textarea' },
      { id: 'hazardous_materials', question: 'Identify hazardous materials (asbestos, etc.)', type: 'textarea' },
      { id: 'odor_treatment', question: 'Is odor treatment required?', type: 'boolean' }
    ]
  },
  MOULD: {
    tier1: [
      { id: 'mould_extent', question: 'What is the mould extent?', type: 'select', options: ['Limited (<1 sqm)', 'Medium (1-10 sqm)', 'Large (>10 sqm)'] },
      { id: 'affected_area', question: 'What is the affected area (sqm)?', type: 'number' },
      { id: 'moisture_source', question: 'What is the moisture source?', type: 'text' }
    ],
    tier2: [
      { id: 'mould_type', question: 'Suspected mould type (if known)', type: 'text' },
      { id: 'structural_damage', question: 'Describe structural damage', type: 'textarea' },
      { id: 'hvac_contamination', question: 'Is HVAC contaminated?', type: 'boolean' }
    ],
    tier3: [
      { id: 'containment_needed', question: 'Is containment required?', type: 'boolean' },
      { id: 'occupant_health', question: 'Any occupant health concerns?', type: 'textarea' },
      { id: 'testing_required', question: 'Is testing/sampling required?', type: 'boolean' }
    ]
  },
  MULTI_LOSS: {
    tier1: [
      { id: 'loss_types', question: 'What types of losses are present?', type: 'multiselect', options: ['Water', 'Fire', 'Mould', 'Storm', 'Other'] },
      { id: 'primary_hazard', question: 'What is the primary hazard?', type: 'select', options: ['Water', 'Fire', 'Mould', 'Storm', 'Other'] },
      { id: 'affected_area', question: 'What is the total affected area (sqm)?', type: 'number' }
    ],
    tier2: [
      { id: 'structural_damage', question: 'Describe structural damage', type: 'textarea' },
      { id: 'contents_damage', question: 'Describe contents damage', type: 'textarea' },
      { id: 'priority_order', question: 'What is the remediation priority order?', type: 'textarea' }
    ],
    tier3: [
      { id: 'safety_hazards', question: 'List all safety hazards', type: 'textarea' },
      { id: 'specialist_required', question: 'Are specialists required?', type: 'textarea' },
      { id: 'insurance_complexity', question: 'Describe insurance complexity', type: 'textarea' }
    ]
  }
}

// GET: Get questions for current tier
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const reportId = params.id
    const { searchParams } = new URL(req.url)
    const tier = searchParams.get('tier') || 'tier1'

    // Verify ownership
    const inspection = await prisma.inspectionReport.findFirst({
      where: {
        id: reportId,
        userId
      }
    })

    if (!inspection) {
      return NextResponse.json(
        { success: false, error: 'Inspection not found' },
        { status: 404 }
      )
    }

    // Get questions for hazard type and tier (using waterCategory as default)
    const hazardType = 'WATER' // RestoreAssist focuses on water damage
    const questions = QUESTION_TIERS[hazardType as keyof typeof QUESTION_TIERS]?.[tier as keyof typeof QUESTION_TIERS.WATER]

    if (!questions) {
      return NextResponse.json(
        { success: false, error: 'Invalid hazard type or tier' },
        { status: 400 }
      )
    }

    // Get existing responses (stored in report fields or custom table)
    // For now, we'll return empty responses
    const responses: Record<string, any> = {}

    return NextResponse.json({
      success: true,
      data: {
        tier,
        questions,
        responses
      }
    })
  } catch (error) {
    console.error('Error fetching questions:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch questions' },
      { status: 500 }
    )
  }
}

// POST: Submit question responses
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const reportId = params.id

    // Verify ownership
    const inspection = await prisma.inspectionReport.findFirst({
      where: {
        id: reportId,
        userId
      }
    })

    if (!inspection) {
      return NextResponse.json(
        { success: false, error: 'Inspection not found' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const { tier, responses } = body

    // Create question responses in the database
    const questionResponses = Object.entries(responses).map(([questionId, answerValue]) => ({
      inspectionReportId: reportId,
      tier: tier === 'tier1' ? 'TIER_1' : tier === 'tier2' ? 'TIER_2' : 'TIER_3',
      questionId,
      questionText: getQuestionText(questionId, tier),
      answerValue: typeof answerValue === 'string' ? answerValue : JSON.stringify(answerValue),
    }))

    // Store responses
    await prisma.questionResponse.createMany({
      data: questionResponses,
      skipDuplicates: true,
    })

    // Get updated inspection with responses
    const updatedInspection = await prisma.inspectionReport.findUnique({
      where: { id: reportId },
      include: { questionResponses: true },
    })

    // Determine next tier
    let nextTier: string | null = null
    if (tier === 'tier1') nextTier = 'tier2'
    else if (tier === 'tier2') nextTier = 'tier3'

    // Audit log would go here (simplified for now)

    return NextResponse.json({
      success: true,
      data: {
        inspection: updatedInspection,
        nextTier,
        completed: tier === 'tier3'
      }
    })
  } catch (error) {
    console.error('Error submitting responses:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to submit responses' },
      { status: 500 }
    )
  }
}

// Helper function to get question text from ID
function getQuestionText(questionId: string, tier: string): string {
  const hazardType = 'WATER'
  const questions = QUESTION_TIERS[hazardType as keyof typeof QUESTION_TIERS]?.[tier as keyof typeof QUESTION_TIERS.WATER]
  const question = questions?.find((q: any) => q.id === questionId)
  return question?.question || questionId
}
