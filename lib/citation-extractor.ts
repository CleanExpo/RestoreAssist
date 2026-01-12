/**
 * Citation Extractor - Extract and validate citations from standards context
 * 
 * Extracts citations from standards documents and validates them against
 * the retrieved standards context.
 */

import { StandardsContext } from './standards-retrieval'
import { FormattedCitation, parseAndFormatCitation, extractAndFormatCitations } from './citation-formatter'

export interface ExtractedCitation extends FormattedCitation {
  sourceDocument: string      // Name of the source document
  sourceSection?: string      // Section text where citation was found
  confidence: number          // Confidence score 0-100
  validated: boolean          // Whether citation was validated against standards
}

/**
 * Extract citations from standards context
 */
export function extractCitationsFromStandards(
  standardsContext: StandardsContext
): ExtractedCitation[] {
  const citations: ExtractedCitation[] = []
  
  standardsContext.documents.forEach(doc => {
    // Extract citations from document name
    const docCitations = extractAndFormatCitations(doc.name)
    docCitations.forEach(citation => {
      citations.push({
        ...citation,
        sourceDocument: doc.name,
        confidence: 90,
        validated: true
      })
    })
    
    // Extract citations from relevant sections
    doc.relevantSections.forEach(section => {
      const sectionCitations = extractAndFormatCitations(section)
      sectionCitations.forEach(citation => {
        // Check if this citation already exists
        const existing = citations.find(c => 
          c.documentCode === citation.documentCode &&
          c.sectionNumber === citation.sectionNumber &&
          c.sourceDocument === doc.name
        )
        
        if (!existing) {
          citations.push({
            ...citation,
            sourceDocument: doc.name,
            sourceSection: section.substring(0, 200), // First 200 chars
            confidence: 85,
            validated: true
          })
        }
      })
    })
    
    // Extract citations from extracted content if available
    if (doc.extractedContent) {
      const contentCitations = extractAndFormatCitations(doc.extractedContent)
      contentCitations.forEach(citation => {
        const existing = citations.find(c => 
          c.documentCode === citation.documentCode &&
          c.sectionNumber === citation.sectionNumber &&
          c.sourceDocument === doc.name
        )
        
        if (!existing) {
          citations.push({
            ...citation,
            sourceDocument: doc.name,
            confidence: 80,
            validated: true
          })
        }
      })
    }
  })
  
  // Remove duplicates and sort by confidence
  const uniqueCitations = citations.filter((citation, index, self) =>
    index === self.findIndex(c => 
      c.documentCode === citation.documentCode && 
      c.sectionNumber === citation.sectionNumber &&
      c.sourceDocument === citation.sourceDocument
    )
  )
  
  return uniqueCitations.sort((a, b) => b.confidence - a.confidence)
}

/**
 * Validate citation against standards context
 */
export function validateCitationAgainstStandards(
  citation: FormattedCitation,
  standardsContext: StandardsContext
): boolean {
  // Check if citation matches any document in standards context
  const documentCode = citation.documentCode.toLowerCase()
  
  return standardsContext.documents.some(doc => {
    const docName = doc.name.toLowerCase()
    const standardType = doc.standardType?.toLowerCase() || ''
    
    // Check for IICRC standards
    if (documentCode.includes('iicrc') || documentCode.includes('s500') || documentCode.includes('s520')) {
      if (docName.includes('s500') || docName.includes('s520') || standardType.includes('s500') || standardType.includes('s520')) {
        return true
      }
    }
    
    // Check for AS/NZS standards
    if (documentCode.includes('as/nzs') || documentCode.includes('asnzs')) {
      if (docName.includes('as/nzs') || docName.includes('3000') || docName.includes('3500')) {
        return true
      }
    }
    
    // Check for building codes
    if (documentCode.includes('ncc') || documentCode.includes('qdc')) {
      if (docName.includes('ncc') || docName.includes('construction') || docName.includes('building')) {
        return true
      }
    }
    
    // Check if citation appears in relevant sections
    const citationText = citation.fullReference.toLowerCase()
    return doc.relevantSections.some(section => 
      section.toLowerCase().includes(citationText)
    )
  })
}

/**
 * Get recommended citations for a specific context
 */
export function getRecommendedCitations(
  standardsContext: StandardsContext,
  context: {
    reportType?: 'water' | 'mould' | 'fire' | 'commercial'
    waterCategory?: '1' | '2' | '3'
    materials?: string[]
  }
): ExtractedCitation[] {
  const allCitations = extractCitationsFromStandards(standardsContext)
  
  // Filter by context
  let filtered = allCitations
  
  // Filter by report type
  if (context.reportType === 'water') {
    filtered = filtered.filter(c => 
      c.documentCode.includes('S500') || 
      c.documentCode.includes('WATER')
    )
  } else if (context.reportType === 'mould') {
    filtered = filtered.filter(c => 
      c.documentCode.includes('S520') || 
      c.documentCode.includes('MOULD') ||
      c.documentCode.includes('MOLD')
    )
  }
  
  // Prioritize high-confidence citations
  return filtered
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10) // Top 10 citations
}

/**
 * Format citations for inclusion in report prompt
 */
export function formatCitationsForPrompt(citations: ExtractedCitation[]): string {
  if (citations.length === 0) {
    return ''
  }
  
  let prompt = '\n\n═══════════════════════════════════════════════════════════════\n'
  prompt += '📚 RECOMMENDED CITATIONS FOR THIS REPORT\n'
  prompt += '═══════════════════════════════════════════════════════════════\n\n'
  prompt += 'The following citations have been extracted from the retrieved standards documents.\n'
  prompt += 'Use these citations when referencing standards in your report:\n\n'
  
  // Group by document type
  const grouped = new Map<string, ExtractedCitation[]>()
  citations.forEach(citation => {
    const key = citation.documentCode.split('-')[0] // Get prefix (IICRC, AS/NZS, etc.)
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(citation)
  })
  
  grouped.forEach((groupCitations, key) => {
    prompt += `\n**${key} Standards:**\n`
    groupCitations.forEach((citation, index) => {
      prompt += `${index + 1}. ${citation.fullReference}`
      if (citation.sourceDocument) {
        prompt += ` (from: ${citation.sourceDocument})`
      }
      prompt += '\n'
    })
  })
  
  prompt += '\n═══════════════════════════════════════════════════════════════\n\n'
  
  return prompt
}
