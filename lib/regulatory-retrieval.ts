/**
 * Regulatory Retrieval Service - Database + Google Drive Integration
 *
 * This service retrieves Australian regulatory documents and citations
 * from Prisma database and Google Drive for inclusion in reports.
 *
 * Features:
 * - Feature flag controlled (ENABLE_REGULATORY_CITATIONS)
 * - Graceful degradation on errors
 * - State-specific building codes
 * - Multi-source citations (Building, Electrical, Consumer, Insurance)
 * - Error handling with fallback to empty context
 */

import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'
import { listDriveItems, downloadDriveFile, searchDriveFiles } from './google-drive'
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromTXT } from './file-extraction'

const prisma = new PrismaClient()

export interface RegulatoryQuery {
  // Existing context fields from standards-retrieval
  reportType: 'water' | 'mould' | 'fire' | 'commercial'
  waterCategory?: '1' | '2' | '3'
  materials?: string[]
  affectedAreas?: string[]

  // NEW regulatory context fields (all optional for backward compatibility)
  state?: string          // QLD, NSW, VIC, SA, WA, TAS, NT, ACT
  postcode?: string
  insurerName?: string
  propertyType?: 'residential' | 'commercial'
  requiresElectricalWork?: boolean
  keywords?: string[]
}

export interface RegulatoryDocumentRef {
  name: string
  documentType: string
  documentCode?: string
  relevantSections: string[]
  citations: Array<{
    reference: string
    text: string
    type: 'building_code' | 'electrical' | 'consumer_law' | 'insurance' | 'plumbing' | 'hvac'
  }>
  jurisdiction?: string
}

export interface RegulatoryContext {
  // Document references grouped by type
  documents: RegulatoryDocumentRef[]

  // Unified summary of regulatory requirements
  summary: string

  // Organized by category for easy extraction
  applicableLaws: string[]
  buildingCodeRequirements: string[]
  electricalRequirements: string[]
  plumbingRequirements: string[]
  hvacRequirements: string[]
  insuranceRequirements: string[]
  consumerProtections: string[]

  // State-specific notes
  stateRequirements?: string

  // Status tracking for graceful degradation
  retrievalSuccess: boolean
  retrievalMethod: 'database' | 'google_drive' | 'hybrid' | 'failed'
  errors?: string[]
}

/**
 * Check if regulatory citations are enabled via feature flag
 */
function isRegulatoryFeatureEnabled(): boolean {
  const enabled = process.env.ENABLE_REGULATORY_CITATIONS === 'true'
  return enabled
}

/**
 * Get Anthropic API key from environment
 */
function getAnthropicClient(apiKey?: string): Anthropic {
  const key = apiKey || process.env.ANTHROPIC_API_KEY
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is required for regulatory retrieval')
  }
  return new Anthropic({ apiKey: key })
}

/**
 * Determine which regulatory documents are relevant based on query context
 */
function determineRelevantRegulations(query: RegulatoryQuery): {
  documentTypes: string[]
  jurisdictions: string[]
  keywords: string[]
} {
  const documentTypes: string[] = []
  const jurisdictions: string[] = []
  const keywords: string[] = []

  // Always include consumer protection and national building code
  documentTypes.push('CONSUMER_LAW')
  documentTypes.push('BUILDING_CODE_NATIONAL')

  // Add state building code if jurisdiction provided
  if (query.state) {
    documentTypes.push('BUILDING_CODE_STATE')
    jurisdictions.push(query.state)
  }

  // Add electrical standards for water damage with electrical work
  if (query.reportType === 'water' || query.requiresElectricalWork) {
    documentTypes.push('ELECTRICAL_STANDARD')
    keywords.push('electrical', 'safety', 'equipment')
  }

  // Add plumbing standards for water damage
  if (query.reportType === 'water' && query.materials?.includes('plumbing')) {
    documentTypes.push('PLUMBING_STANDARD')
    keywords.push('plumbing', 'drainage', 'contamination')
  }

  // Add HVAC standards for moisture/mould work
  if (query.reportType === 'mould' || query.reportType === 'water') {
    documentTypes.push('HVAC_STANDARD') // Note: Use existing pattern, adjust if needed
    keywords.push('ventilation', 'humidity', 'dehumidification', 'air-conditioning')
  }

  // Add insurance regulations if insurer name provided
  if (query.insurerName) {
    documentTypes.push('INSURANCE_POLICY')
    documentTypes.push('INSURANCE_REGULATION')
  }

  // Add safety regulations for all scenarios
  documentTypes.push('SAFETY_REGULATION')
  keywords.push('hazard', 'safety', 'compliance')

  // Add keywords from query
  if (query.waterCategory) {
    keywords.push(`Category ${query.waterCategory}`)
  }
  if (query.materials) {
    keywords.push(...query.materials)
  }
  if (query.affectedAreas) {
    keywords.push(...query.affectedAreas)
  }

  return {
    documentTypes,
    jurisdictions,
    keywords: [...new Set(keywords)], // Remove duplicates
  }
}

/**
 * Retrieve regulatory documents from database with error handling
 */
async function retrieveRegulatoryDocumentsFromDatabase(
  regulations: ReturnType<typeof determineRelevantRegulations>,
  query: RegulatoryQuery
): Promise<Array<any>> {
  try {
    const documents = await prisma.regulatoryDocument.findMany({
      where: {
        AND: [
          {
            documentType: {
              in: regulations.documentTypes,
            }
          },
          query.state && regulations.jurisdictions.length > 0 ? {
            OR: [
              { jurisdiction: null }, // National documents
              { jurisdiction: { in: regulations.jurisdictions } } // State-specific
            ]
          } : {},
        ]
      },
      include: {
        sections: {
          where: {
            AND: [
              query.waterCategory ? {
                applicableToWaterCategory: {
                  hasSome: [`Category ${query.waterCategory}`]
                }
              } : {},
              regulations.keywords.length > 0 ? {
                OR: [
                  { keywords: { hasSome: regulations.keywords } },
                  { topics: { hasSome: regulations.keywords } }
                ]
              } : {}
            ]
          },
          take: 3, // Limit to top 3 sections per document
        },
        citations: {
          take: 2, // Limit to top 2 citations per document
        }
      },
      take: 8, // Limit to top 8 documents
    })

    return documents
  } catch (error) {
    console.error('Error retrieving regulatory documents from database:', error)
    return []
  }
}

/**
 * Build regulatory context from retrieved documents
 */
async function buildRegulatoryContext(
  documents: any[],
  query: RegulatoryQuery,
  anthropic?: Anthropic
): Promise<RegulatoryContext> {
  const context: RegulatoryContext = {
    documents: [],
    summary: '',
    applicableLaws: [],
    buildingCodeRequirements: [],
    electricalRequirements: [],
    plumbingRequirements: [],
    hvacRequirements: [],
    insuranceRequirements: [],
    consumerProtections: [],
    retrievalSuccess: documents.length > 0,
    retrievalMethod: 'database',
    errors: [],
  }

  if (documents.length === 0) {
    context.retrievalSuccess = false
    context.errors?.push('No regulatory documents found for this query')
    return context
  }

  try {
    // Process each document
    for (const doc of documents) {
      const docRef: RegulatoryDocumentRef = {
        name: doc.title,
        documentType: doc.documentType,
        documentCode: doc.documentCode,
        relevantSections: [],
        citations: [],
        jurisdiction: doc.jurisdiction,
      }

      // Add sections
      if (doc.sections && doc.sections.length > 0) {
        docRef.relevantSections = doc.sections.map((s: any) => `${s.sectionNumber}: ${s.sectionTitle}`)
      }

      // Add citations
      if (doc.citations && doc.citations.length > 0) {
        docRef.citations = doc.citations.map((c: any) => ({
          reference: c.shortReference,
          text: c.citationText.substring(0, 200), // Limit to 200 chars
          type: getCitationType(doc.documentType)
        }))
      }

      context.documents.push(docRef)

      // Categorize requirements by type
      categorizeDocumentRequirements(doc, context)
    }

    // Build summary using AI if available and requested
    if (anthropic && context.documents.length > 0) {
      try {
        const summary = await generateRegulatoryContextSummary(
          anthropic,
          context,
          query
        )
        context.summary = summary
      } catch (aiError) {
        console.error('Error generating AI summary:', aiError)
        context.summary = buildSimpleSummary(context)
      }
    } else {
      context.summary = buildSimpleSummary(context)
    }

    // Add state-specific notes
    if (query.state) {
      context.stateRequirements = buildStateRequirementsSummary(query.state, context)
    }

    context.retrievalSuccess = true
  } catch (error) {
    console.error('Error building regulatory context:', error)
    context.retrievalSuccess = false
    context.errors?.push(`Error processing regulatory documents: ${error}`)
  }

  return context
}

/**
 * Categorize document requirements by type
 */
function categorizeDocumentRequirements(doc: any, context: RegulatoryContext): void {
  const docType = doc.documentType.toLowerCase()

  // Create summary from sections
  const requirements = doc.sections
    ?.map((s: any) => s.summary || s.sectionTitle)
    .filter((r: any) => r)
    .slice(0, 2) || []

  if (docType.includes('BUILDING')) {
    context.buildingCodeRequirements.push(
      ...requirements,
      `${doc.documentCode}: ${doc.title}`
    )
  }

  if (docType.includes('ELECTRICAL')) {
    context.electricalRequirements.push(
      ...requirements,
      `${doc.documentCode}: ${doc.title}`
    )
  }

  if (docType.includes('PLUMBING')) {
    context.plumbingRequirements.push(
      ...requirements,
      `${doc.documentCode}: ${doc.title}`
    )
  }

  if (docType.includes('HVAC') || docType.includes('VENTILATION')) {
    context.hvacRequirements.push(
      ...requirements,
      `${doc.documentCode}: ${doc.title}`
    )
  }

  if (docType.includes('INSURANCE')) {
    context.insuranceRequirements.push(
      ...requirements,
      `${doc.documentCode}: ${doc.title}`
    )
  }

  if (docType.includes('CONSUMER')) {
    context.consumerProtections.push(
      ...requirements,
      `${doc.documentCode}: ${doc.title}`
    )
  }

  if (docType.includes('CONSUMER') || docType.includes('LAW') || docType.includes('REGULATION')) {
    context.applicableLaws.push(`${doc.documentCode}: ${doc.title}`)
  }
}

/**
 * Determine citation type from document type
 */
function getCitationType(
  documentType: string
): 'building_code' | 'electrical' | 'consumer_law' | 'insurance' | 'plumbing' | 'hvac' {
  const type = documentType.toLowerCase()

  if (type.includes('BUILDING')) return 'building_code'
  if (type.includes('ELECTRICAL')) return 'electrical'
  if (type.includes('CONSUMER') || type.includes('LAW')) return 'consumer_law'
  if (type.includes('INSURANCE')) return 'insurance'
  if (type.includes('PLUMBING')) return 'plumbing'
  if (type.includes('HVAC') || type.includes('VENTILATION')) return 'hvac'

  return 'building_code' // Default fallback
}

/**
 * Build simple summary from context without AI
 */
function buildSimpleSummary(context: RegulatoryContext): string {
  const parts: string[] = []

  if (context.buildingCodeRequirements.length > 0) {
    parts.push(`Building Code: ${context.buildingCodeRequirements.slice(0, 2).join(', ')}`)
  }

  if (context.electricalRequirements.length > 0) {
    parts.push(`Electrical: ${context.electricalRequirements.slice(0, 2).join(', ')}`)
  }

  if (context.plumbingRequirements.length > 0) {
    parts.push(`Plumbing: ${context.plumbingRequirements.slice(0, 2).join(', ')}`)
  }

  if (context.hvacRequirements.length > 0) {
    parts.push(`HVAC: ${context.hvacRequirements.slice(0, 2).join(', ')}`)
  }

  if (context.insuranceRequirements.length > 0) {
    parts.push(`Insurance: ${context.insuranceRequirements.slice(0, 2).join(', ')}`)
  }

  if (context.consumerProtections.length > 0) {
    parts.push(`Consumer Protection: ${context.consumerProtections.slice(0, 2).join(', ')}`)
  }

  return parts.length > 0
    ? parts.join('; ')
    : 'Regulatory context retrieved but no specific requirements identified'
}

/**
 * Build state-specific requirements summary
 */
function buildStateRequirementsSummary(state: string, context: RegulatoryContext): string {
  const parts: string[] = [`${state}-specific Requirements:`]

  // Find state-specific documents
  const stateDocuments = context.documents.filter(d => d.jurisdiction === state)

  if (stateDocuments.length > 0) {
    parts.push(
      `Apply ${state} Building Code:`,
      stateDocuments.map(d => d.name).join(', ')
    )
  }

  // Add state-specific notes based on climate
  const stateNotes = getStateClimateNotes(state)
  if (stateNotes) {
    parts.push(`Climate Considerations: ${stateNotes}`)
  }

  return parts.join(' ')
}

/**
 * Get state-specific climate and humidity notes
 */
function getStateClimateNotes(state: string): string {
  const notes: Record<string, string> = {
    'QLD': 'Subtropical climate with 70%+ humidity - extended drying times (5-14 days standard, 14-28 days dense materials)',
    'NSW': 'Coastal/inland variation with 40-70% humidity - drying times 7-14 days standard, 14-28 days dense',
    'VIC': 'Temperate climate with 35-65% humidity - drying times 10-18 days standard, 18-35 days dense',
    'SA': 'Arid/semi-arid with 25-50% humidity - fastest drying 5-10 days (benefit from dry climate)',
    'WA': 'Regional variation: Tropical north 14-28 days, Southern temperate 7-18 days',
    'TAS': 'Cool, wet climate with 50-75% humidity - extended drying 14-21 days standard, 21-40+ days dense',
    'ACT': 'Temperate inland with 30-60% humidity - drying times 8-15 days standard, 15-28 days dense',
    'NT': 'Extreme variation: Tropical Darwin 18-30 days, Arid Alice Springs 3-8 days (fastest)',
  }

  return notes[state] || ''
}

/**
 * Use Anthropic API to generate regulatory context summary
 */
async function generateRegulatoryContextSummary(
  anthropic: Anthropic,
  context: RegulatoryContext,
  query: RegulatoryQuery
): Promise<string> {
  try {
    // Build context text from documents
    const contextText = context.documents
      .map(d => `${d.documentCode || d.name}: ${d.relevantSections.join('; ')}`)
      .join('\n')

    const systemPrompt = `You are an expert in Australian building codes, electrical standards, insurance regulations, and consumer protection laws. Your task is to create a concise summary of regulatory requirements for a water/mould damage restoration report.

The summary should:
1. Identify the most critical regulatory requirements
2. Highlight state-specific building code obligations
3. Note insurance compliance requirements
4. Summarize consumer protection obligations
5. Be practical and actionable for the report

Keep the summary to 2-3 sentences, focusing on mandatory requirements.`

    const userPrompt = `Regulatory documents retrieved for ${query.reportType} damage restoration in ${query.state || 'Australia'}:

${contextText}

Water Category: ${query.waterCategory || 'Not specified'}
Requires Electrical Work: ${query.requiresElectricalWork ? 'Yes' : 'No'}

Please provide a concise 2-3 sentence summary of the most critical regulatory requirements.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    })

    if (response.content[0].type === 'text') {
      return response.content[0].text
    }

    return buildSimpleSummary(context)
  } catch (error) {
    console.error('Error generating AI summary:', error)
    return buildSimpleSummary(context)
  }
}

/**
 * Main function: Retrieve regulatory context for report generation
 *
 * CRITICAL FEATURES:
 * - Feature flag controlled (returns empty context if disabled)
 * - Graceful degradation on errors (returns empty context, doesn't throw)
 * - Backward compatible (all parameters optional)
 * - Database-first approach with optional Google Drive fallback
 *
 * @param query - Regulatory query with optional state/jurisdiction context
 * @param apiKey - Optional Anthropic API key (uses env var if not provided)
 * @returns RegulatoryContext with success status (never throws)
 */
export async function retrieveRegulatoryContext(
  query: RegulatoryQuery,
  apiKey?: string
): Promise<RegulatoryContext> {
  // Check feature flag FIRST - if disabled, return empty context immediately
  if (!isRegulatoryFeatureEnabled()) {
    return {
      documents: [],
      summary: '',
      applicableLaws: [],
      buildingCodeRequirements: [],
      electricalRequirements: [],
      plumbingRequirements: [],
      hvacRequirements: [],
      insuranceRequirements: [],
      consumerProtections: [],
      retrievalSuccess: false,
      retrievalMethod: 'failed',
      errors: ['Regulatory citations feature is disabled'],
    }
  }

  try {
    // Determine relevant regulations based on query
    const regulations = determineRelevantRegulations(query)

    // Try to retrieve from database first
    const documents = await retrieveRegulatoryDocumentsFromDatabase(
      regulations,
      query
    )

    // Build context from retrieved documents
    let anthropic: Anthropic | undefined
    try {
      anthropic = getAnthropicClient(apiKey)
    } catch (error) {
      console.warn('Anthropic API not available for summary generation:', error)
    }

    const context = await buildRegulatoryContext(documents, query, anthropic)

    return context
  } catch (error) {
    // Graceful degradation: return empty context on error
    console.error('Error in retrieveRegulatoryContext:', error)

    return {
      documents: [],
      summary: '',
      applicableLaws: [],
      buildingCodeRequirements: [],
      electricalRequirements: [],
      plumbingRequirements: [],
      hvacRequirements: [],
      insuranceRequirements: [],
      consumerProtections: [],
      retrievalSuccess: false,
      retrievalMethod: 'failed',
      errors: [`Regulatory context retrieval failed: ${error}`],
    }
  }
}

/**
 * Format regulatory context into a prompt-ready string for AI integration
 *
 * Used for injecting regulatory context into report generation prompts
 */
export function formatRegulatoryContextForPrompt(context: RegulatoryContext): string {
  if (!context.retrievalSuccess || context.documents.length === 0) {
    return ''
  }

  const parts: string[] = ['REGULATORY COMPLIANCE CONTEXT:']

  if (context.summary) {
    parts.push(`Summary: ${context.summary}`)
  }

  if (context.buildingCodeRequirements.length > 0) {
    parts.push(`Building Code: ${context.buildingCodeRequirements.join('; ')}`)
  }

  if (context.electricalRequirements.length > 0) {
    parts.push(`Electrical Standards: ${context.electricalRequirements.join('; ')}`)
  }

  if (context.plumbingRequirements.length > 0) {
    parts.push(`Plumbing Standards: ${context.plumbingRequirements.join('; ')}`)
  }

  if (context.hvacRequirements.length > 0) {
    parts.push(`HVAC Standards: ${context.hvacRequirements.join('; ')}`)
  }

  if (context.insuranceRequirements.length > 0) {
    parts.push(`Insurance Requirements: ${context.insuranceRequirements.join('; ')}`)
  }

  if (context.consumerProtections.length > 0) {
    parts.push(`Consumer Protection: ${context.consumerProtections.join('; ')}`)
  }

  if (context.stateRequirements) {
    parts.push(context.stateRequirements)
  }

  return parts.join('\n')
}

/**
 * Get citations from regulatory context for use in PDF generation
 *
 * Formats citations for inclusion in scope items
 */
export function extractCitationsFromContext(
  context: RegulatoryContext
): Array<{
  reference: string
  text: string
  type: string
}> {
  const citations: Array<any> = []

  for (const doc of context.documents) {
    citations.push(...doc.citations)
  }

  return citations
}

/**
 * Cleanup: Close Prisma connection when done
 */
export async function closeRegulatoryConnection(): Promise<void> {
  await prisma.$disconnect()
}
