/**
 * Citation Engine - AI-Powered Regulatory Citation Generation
 *
 * This service uses Claude AI to intelligently match restoration scope items
 * to relevant regulatory documents and generate proper AGLC4-formatted citations.
 *
 * Features:
 * - AI-powered scope-to-regulation matching
 * - Citation validation against database
 * - AGLC4 format compliance
 * - Multi-source citation generation
 * - Graceful degradation on errors
 */

import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'
import { RegulatoryContext } from './regulatory-retrieval'

const prisma = new PrismaClient()

export interface GeneratedCitation {
  reference: string           // AGLC4 formatted reference
  shortReference: string      // Abbreviated form for text
  citationText: string        // Full quoted text
  relevanceScore: number      // 0-100 confidence
  documentCode?: string
  sectionNumber?: string
  type: 'building_code' | 'electrical' | 'consumer_law' | 'insurance' | 'plumbing' | 'hvac'
  jurisdiction?: string
}

export interface ScopeItemWithCitations {
  scopeItem: string
  description: string
  standardReference?: string  // Existing IICRC reference
  regulatoryCitations: GeneratedCitation[]
  confidenceScore: number     // Overall confidence in citations
}

export interface CitationAnalysis {
  scopeItem: string
  relevantRegulations: string[]
  suggestedCitations: GeneratedCitation[]
  analysisReasoning: string
  confidence: number
}

/**
 * Get Anthropic API client
 */
function getAnthropicClient(apiKey?: string): Anthropic {
  const key = apiKey || process.env.ANTHROPIC_API_KEY
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is required for citation generation')
  }
  return new Anthropic({ apiKey: key })
}

/**
 * Analyze a scope item and identify relevant regulations
 *
 * Uses Claude to intelligently match scope items to regulatory documents
 */
async function analyzeAndMatchRegulations(
  anthropic: Anthropic,
  scopeItem: string,
  description: string,
  regulatoryContext: RegulatoryContext
): Promise<CitationAnalysis> {
  try {
    // Build regulatory context text for AI
    const regulatoryText = regulatoryContext.documents
      .map(d => `${d.documentCode || d.name}: ${d.relevantSections.join(', ')}`)
      .join('\n')

    const systemPrompt = `You are an expert Australian water and mould damage restoration specialist with deep knowledge of regulatory compliance. Your task is to analyze restoration scope items and identify the most relevant regulatory requirements from Australian building codes, electrical standards, insurance regulations, and consumer protection laws.

For each scope item, you must:
1. Identify which regulations are most relevant
2. Explain why those regulations apply
3. Suggest specific citations (section references)
4. Assess confidence in the regulatory match (0-100%)

Focus on regulations that:
- Are mandatory for the type of work described
- Have specific compliance requirements mentioned
- Apply to the materials and methods described
- Include verifiable procedures and standards

Use AGLC4 format for all citations (e.g., "NCC 2025 Sec 3.2.1").`

    const userPrompt = `AVAILABLE REGULATORY DOCUMENTS:
${regulatoryText}

SCOPE ITEM TO ANALYZE:
Item: ${scopeItem}
Description: ${description}

Please identify the most relevant regulations for this scope item. For each relevant regulation, provide:
1. The regulatory reference (e.g., "NCC 2025", "QDC 4.5", "AS/NZS 3000")
2. The specific section or part number
3. Why this regulation applies to this scope item
4. Your confidence that this citation is relevant (0-100%)

Focus on the most critical and directly applicable regulations first.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    })

    if (response.content[0].type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    const analysisText = response.content[0].text

    // Parse AI response to extract regulatory matches
    const relevantRegulations = extractRegulatoryMatches(analysisText)
    const suggestedCitations = parseCitationsFromAnalysis(analysisText)
    const averageConfidence = calculateAverageConfidence(suggestedCitations)

    return {
      scopeItem,
      relevantRegulations,
      suggestedCitations,
      analysisReasoning: analysisText,
      confidence: averageConfidence,
    }
  } catch (error) {
    console.error('Error analyzing scope item:', error)
    // Return empty analysis on error
    return {
      scopeItem,
      relevantRegulations: [],
      suggestedCitations: [],
      analysisReasoning: `Error analyzing scope item: ${error}`,
      confidence: 0,
    }
  }
}

/**
 * Extract regulatory matches from AI analysis text
 */
function extractRegulatoryMatches(analysisText: string): string[] {
  const matches: string[] = []

  // Common regulatory document patterns
  const documentPatterns = [
    /NCC\s*2025/gi,
    /QDC\s*4\.5/gi,
    /NSW\s*Building\s*Code/gi,
    /VIC.*Building/gi,
    /AS[\/\\]*NZS\s*3000/gi,
    /AS[\/\\]*NZS\s*3500/gi,
    /AS\s*1668/gi,
    /AS[\/\\]*NZS\s*3666/gi,
    /Australian\s*Consumer\s*Law/gi,
    /General\s*Insurance\s*Code/gi,
    /Work\s*Health\s*and\s*Safety/gi,
  ]

  for (const pattern of documentPatterns) {
    const found = analysisText.match(pattern)
    if (found) {
      matches.push(found[0])
    }
  }

  return [...new Set(matches)] // Remove duplicates
}

/**
 * Parse citations from AI analysis text
 */
function parseCitationsFromAnalysis(analysisText: string): GeneratedCitation[] {
  const citations: GeneratedCitation[] = []

  // Pattern: "NCC 2025 Section 3.2.1" or "NCC 2025 Sec 3.2.1"
  const citationPattern = /([A-Z\/\-\s\d\.]+?)\s+(?:Section|Sec|Clause)\s+([\d\.]+)/gi

  let match
  while ((match = citationPattern.exec(analysisText)) !== null) {
    const docCode = match[1].trim()
    const sectionNum = match[2]

    // Extract type based on document code
    const type = determineCitationType(docCode)

    citations.push({
      reference: `${docCode} Sec ${sectionNum}`,
      shortReference: `${docCode} Sec ${sectionNum}`,
      citationText: '', // Will be filled from database
      relevanceScore: 75, // Default score (can be adjusted by validation)
      documentCode: docCode,
      sectionNumber: sectionNum,
      type,
    })
  }

  return citations
}

/**
 * Determine citation type from document code
 */
function determineCitationType(
  docCode: string
): 'building_code' | 'electrical' | 'consumer_law' | 'insurance' | 'plumbing' | 'hvac' {
  const code = docCode.toLowerCase()

  if (code.includes('ncc') || code.includes('qdc') || code.includes('building') || code.includes('code')) {
    return 'building_code'
  }
  if (code.includes('as/nzs 3000') || code.includes('electrical')) {
    return 'electrical'
  }
  if (code.includes('as/nzs 3500') || code.includes('plumbing') || code.includes('drainage')) {
    return 'plumbing'
  }
  if (code.includes('as 1668') || code.includes('hvac') || code.includes('ventilation')) {
    return 'hvac'
  }
  if (code.includes('consumer') || code.includes('law')) {
    return 'consumer_law'
  }
  if (code.includes('insurance') || code.includes('code of practice')) {
    return 'insurance'
  }

  return 'building_code' // Default
}

/**
 * Calculate average confidence from citations
 */
function calculateAverageConfidence(citations: GeneratedCitation[]): number {
  if (citations.length === 0) return 0
  const sum = citations.reduce((acc, c) => acc + c.relevanceScore, 0)
  return Math.round(sum / citations.length)
}

/**
 * Validate and enhance citations using database
 *
 * Checks if citations exist in database and retrieves full citation text
 */
async function validateAndEnhanceCitations(
  citations: GeneratedCitation[],
  regulatoryContext: RegulatoryContext
): Promise<GeneratedCitation[]> {
  const enhanced: GeneratedCitation[] = []

  for (const citation of citations) {
    try {
      // Try to find exact match in regulatory context
      let found = false

      for (const doc of regulatoryContext.documents) {
        if (
          doc.documentCode?.includes(citation.documentCode || '') ||
          doc.name.includes(citation.documentCode || '')
        ) {
          // Found matching document - look for section
          if (citation.sectionNumber) {
            const matchingSection = doc.relevantSections.find(s =>
              s.includes(citation.sectionNumber || '')
            )

            if (matchingSection) {
              // Found matching section
              const matchingCitation = doc.citations.find(c =>
                c.reference.includes(citation.sectionNumber || '')
              )

              if (matchingCitation) {
                // Found full citation - enhance it
                enhanced.push({
                  ...citation,
                  citationText: matchingCitation.text,
                  relevanceScore: Math.min(100, citation.relevanceScore + 10), // Boost score for database match
                  reference: matchingCitation.reference,
                  shortReference: matchingCitation.reference,
                })
                found = true
                break
              }
            }
          }
        }
      }

      // If not found in database, use as-is with lower confidence
      if (!found) {
        enhanced.push({
          ...citation,
          relevanceScore: Math.max(0, citation.relevanceScore - 10), // Reduce confidence if not in DB
        })
      }
    } catch (error) {
      console.error('Error validating citation:', error)
      // Add citation as-is if validation fails
      enhanced.push(citation)
    }
  }

  return enhanced
}

/**
 * Generate citations for a single scope item
 *
 * Main public function for generating citations
 */
export async function generateCitationsForScopeItem(
  scopeItem: string,
  description: string,
  regulatoryContext: RegulatoryContext,
  apiKey?: string
): Promise<GeneratedCitation[]> {
  try {
    // Don't generate if regulatory feature is disabled or context empty
    if (!regulatoryContext.retrievalSuccess || regulatoryContext.documents.length === 0) {
      return []
    }

    // Get Anthropic client
    const anthropic = getAnthropicClient(apiKey)

    // Analyze scope item and match to regulations
    const analysis = await analyzeAndMatchRegulations(
      anthropic,
      scopeItem,
      description,
      regulatoryContext
    )

    // Validate and enhance citations using database
    const validated = await validateAndEnhanceCitations(
      analysis.suggestedCitations,
      regulatoryContext
    )

    // Filter to high-confidence citations only
    const highConfidence = validated.filter(c => c.relevanceScore >= 50)

    // Sort by confidence score (highest first)
    return highConfidence.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 3)
  } catch (error) {
    console.error('Error generating citations:', error)
    return []
  }
}

/**
 * Generate citations for multiple scope items
 *
 * Batch process for full report generation
 */
export async function generateCitationsForScopeItems(
  scopeItems: Array<{
    item: string
    description: string
  }>,
  regulatoryContext: RegulatoryContext,
  apiKey?: string
): Promise<ScopeItemWithCitations[]> {
  const results: ScopeItemWithCitations[] = []

  for (const scopeItem of scopeItems) {
    const citations = await generateCitationsForScopeItem(
      scopeItem.item,
      scopeItem.description,
      regulatoryContext,
      apiKey
    )

    const confidenceScore = citations.length > 0
      ? citations.reduce((acc, c) => acc + c.relevanceScore, 0) / citations.length
      : 0

    results.push({
      scopeItem: scopeItem.item,
      description: scopeItem.description,
      regulatoryCitations: citations,
      confidenceScore: Math.round(confidenceScore),
    })
  }

  return results
}

/**
 * Generate citation analysis report
 *
 * Detailed analysis without generating full citations (useful for validation)
 */
export async function analyzeRegulatoryCoverage(
  scopeItems: Array<{
    item: string
    description: string
  }>,
  regulatoryContext: RegulatoryContext,
  apiKey?: string
): Promise<CitationAnalysis[]> {
  const analyses: CitationAnalysis[] = []

  try {
    const anthropic = getAnthropicClient(apiKey)

    for (const scopeItem of scopeItems) {
      const analysis = await analyzeAndMatchRegulations(
        anthropic,
        scopeItem.item,
        scopeItem.description,
        regulatoryContext
      )
      analyses.push(analysis)
    }
  } catch (error) {
    console.error('Error analyzing regulatory coverage:', error)
  }

  return analyses
}

/**
 * Format citations for PDF inclusion
 *
 * Converts generated citations to formatted text for PDF scope items
 */
export function formatCitationsForPDF(citations: GeneratedCitation[]): string {
  if (citations.length === 0) {
    return ''
  }

  const formatted = citations
    .map(c => {
      const refText = `${c.reference}`
      const confidenceMarker = c.relevanceScore >= 80 ? '✓' : ''
      return `${refText}${confidenceMarker}`
    })
    .join(' | ')

  return formatted
}

/**
 * Format citations for inline text (footnotes, callouts)
 *
 * Used for inline regulatory references in scope descriptions
 */
export function formatCitationsForText(citations: GeneratedCitation[]): string[] {
  return citations.map(c => c.shortReference)
}

/**
 * Extract jurisdiction from citations
 *
 * Useful for identifying state-specific requirements
 */
export function extractJurisdictionsFromCitations(
  citations: GeneratedCitation[]
): Set<string> {
  const jurisdictions = new Set<string>()

  for (const citation of citations) {
    if (citation.jurisdiction) {
      jurisdictions.add(citation.jurisdiction)
    }

    // Extract from document code if possible
    if (citation.documentCode) {
      const code = citation.documentCode.toUpperCase()
      if (code.includes('QDC')) jurisdictions.add('QLD')
      if (code.includes('NSW')) jurisdictions.add('NSW')
      if (code.includes('VIC')) jurisdictions.add('VIC')
      if (code.includes('SA')) jurisdictions.add('SA')
      if (code.includes('WA')) jurisdictions.add('WA')
      if (code.includes('TAS')) jurisdictions.add('TAS')
      if (code.includes('ACT')) jurisdictions.add('ACT')
      if (code.includes('NT')) jurisdictions.add('NT')
    }
  }

  return jurisdictions
}

/**
 * Score citation relevance (0-100)
 *
 * Higher score = more relevant to the scope item
 */
export function scoreCitationRelevance(
  citation: GeneratedCitation,
  scopeItem: string
): number {
  let score = citation.relevanceScore

  // Boost score if keywords match
  const scopeLower = scopeItem.toLowerCase()
  const refLower = citation.reference.toLowerCase()

  if (scopeLower.includes('electrical') && refLower.includes('3000')) score += 10
  if (scopeLower.includes('moisture') && refLower.includes('ncc')) score += 10
  if (scopeLower.includes('mould') && refLower.includes('health')) score += 10
  if (scopeLower.includes('plumbing') && refLower.includes('3500')) score += 10
  if (scopeLower.includes('hvac') && (refLower.includes('1668') || refLower.includes('3666'))) score += 10

  return Math.min(100, score)
}

/**
 * Group citations by type
 *
 * Organize citations for different regulatory categories
 */
export function groupCitationsByType(
  citations: GeneratedCitation[]
): Record<string, GeneratedCitation[]> {
  const grouped: Record<string, GeneratedCitation[]> = {
    building_code: [],
    electrical: [],
    consumer_law: [],
    insurance: [],
    plumbing: [],
    hvac: [],
  }

  for (const citation of citations) {
    grouped[citation.type].push(citation)
  }

  return grouped
}

/**
 * Generate citation summary
 *
 * Brief summary of all citations in one scope item
 */
export function generateCitationSummary(citations: GeneratedCitation[]): string {
  if (citations.length === 0) {
    return 'No regulatory citations applicable'
  }

  const byType = groupCitationsByType(citations)
  const summaryParts: string[] = []

  if (byType.building_code.length > 0) {
    summaryParts.push(`Building Code: ${byType.building_code.map(c => c.documentCode).join(', ')}`)
  }
  if (byType.electrical.length > 0) {
    summaryParts.push(`Electrical: ${byType.electrical.map(c => c.documentCode).join(', ')}`)
  }
  if (byType.plumbing.length > 0) {
    summaryParts.push(`Plumbing: ${byType.plumbing.map(c => c.documentCode).join(', ')}`)
  }
  if (byType.hvac.length > 0) {
    summaryParts.push(`HVAC: ${byType.hvac.map(c => c.documentCode).join(', ')}`)
  }
  if (byType.insurance.length > 0) {
    summaryParts.push(`Insurance: ${byType.insurance.map(c => c.documentCode).join(', ')}`)
  }
  if (byType.consumer_law.length > 0) {
    summaryParts.push(`Consumer: ${byType.consumer_law.map(c => c.documentCode).join(', ')}`)
  }

  return summaryParts.join('; ')
}

/**
 * Cleanup
 */
export async function closeCitationEngineConnection(): Promise<void> {
  await prisma.$disconnect()
}
