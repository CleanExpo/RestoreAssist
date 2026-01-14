/**
 * Citation Formatter - AGLC4 Compliance
 *
 * This service formats regulatory citations according to the Australian Guide to Legal Citation (4th edition).
 * AGLC4 is the standard for Australian legal citations used in legal documents, court proceedings, and reports.
 *
 * Reference: https://law.unimelb.edu.au/research/australian-guide-legal-citation
 *
 * Examples of AGLC4 formatted citations:
 * - National Construction Code 2025, ch 3
 * - Queensland Development Code 4.5, s 3.2
 * - AS/NZS 3000:2023, s 2.4
 * - Australian Consumer Law, Schedule 2, Division 1
 * - Work Health and Safety Act 2011 (Cth), s 36
 */

export interface CitationComponents {
  documentName: string      // e.g., "National Construction Code"
  documentYear?: number     // e.g., 2025
  documentCode?: string     // e.g., "NCC", "QDC 4.5", "AS/NZS 3000"
  jurisdiction?: string     // e.g., "(Cth)", "(Qld)"
  chapterNumber?: string    // For numbered chapters
  sectionNumber?: string    // e.g., "3.2"
  scheduleNumber?: string   // For schedules
  divisionNumber?: string   // For divisions
}

export interface FormattedCitation {
  fullReference: string    // Full AGLC4 formatted citation
  shortReference: string   // Short form for in-text
  inTextCitation: string   // Parenthetical form (Author Year, p. XX)
  footnoteCitation: string // Footnote format
}

/**
 * Standardized document names for AGLC4 compliance
 */
const DOCUMENT_STANDARDS: Record<string, { name: string; code: string; jurisdiction: string }> = {
  // National Building Codes
  'NCC': {
    name: 'National Construction Code',
    code: 'NCC',
    jurisdiction: '(Cth)'
  },
  'NCC 2025': {
    name: 'National Construction Code',
    code: 'NCC',
    jurisdiction: '(Cth)'
  },

  // State Building Codes
  'QDC': {
    name: 'Queensland Development Code',
    code: 'QDC',
    jurisdiction: '(Qld)'
  },
  'QDC 4.5': {
    name: 'Queensland Development Code',
    code: 'QDC',
    jurisdiction: '(Qld)'
  },
  'NSW Building Code': {
    name: 'NSW Building Code',
    code: 'NSW BC',
    jurisdiction: '(NSW)'
  },
  'VIC Building Regulations': {
    name: 'Victoria Building Regulations',
    code: 'VIC BR',
    jurisdiction: '(Vic)'
  },
  'SA Building Code': {
    name: 'South Australia Building Code',
    code: 'SA BC',
    jurisdiction: '(SA)'
  },
  'WA Building Code': {
    name: 'Western Australia Building Code',
    code: 'WA BC',
    jurisdiction: '(WA)'
  },
  'TAS Building Code': {
    name: 'Tasmania Building Code',
    code: 'TAS BC',
    jurisdiction: '(Tas)'
  },
  'ACT Building Code': {
    name: 'ACT Building Code',
    code: 'ACT BC',
    jurisdiction: '(ACT)'
  },
  'NT Building Code': {
    name: 'Northern Territory Building Code',
    code: 'NT BC',
    jurisdiction: '(NT)'
  },

  // Electrical Standards (Australian/NZS)
  'AS/NZS 3000': {
    name: 'AS/NZS 3000:2023, Electrical Installations',
    code: 'AS/NZS 3000:2023',
    jurisdiction: '(Cth)'
  },
  'AS/NZS 3500': {
    name: 'AS/NZS 3500:2021, Plumbing and Drainage',
    code: 'AS/NZS 3500',
    jurisdiction: '(Cth)'
  },
  'AS 1668': {
    name: 'AS 1668.1:2002, The use of ventilation and air-conditioning in buildings',
    code: 'AS 1668.1:2002',
    jurisdiction: '(Cth)'
  },
  'AS/NZS 3666': {
    name: 'AS/NZS 3666:2011, Air-handling systems in buildings',
    code: 'AS/NZS 3666:2011',
    jurisdiction: '(Cth)'
  },

  // Legislation
  'Australian Consumer Law': {
    name: 'Australian Consumer Law',
    code: 'ACL',
    jurisdiction: '(Cth)'
  },
  'Work Health and Safety Act 2011': {
    name: 'Work Health and Safety Act 2011',
    code: 'WHSA',
    jurisdiction: '(Cth)'
  },
  'Insurance Contracts Act 1984': {
    name: 'Insurance Contracts Act 1984',
    code: 'ICA',
    jurisdiction: '(Cth)'
  },

  // Industry Codes
  'General Insurance Code of Practice': {
    name: 'General Insurance Code of Practice',
    code: 'GICP',
    jurisdiction: '(Cth)'
  }
}

/**
 * Normalize document name to standard form
 */
export function normalizeDocumentName(
  input: string
): { name: string; code: string; jurisdiction: string } | null {
  // Check exact matches first
  if (DOCUMENT_STANDARDS[input]) {
    return DOCUMENT_STANDARDS[input]
  }

  // Check case-insensitive matches
  const lowerInput = input.toLowerCase()
  for (const [key, value] of Object.entries(DOCUMENT_STANDARDS)) {
    if (key.toLowerCase() === lowerInput) {
      return value
    }
  }

  // Check partial matches
  if (lowerInput.includes('ncc')) return DOCUMENT_STANDARDS['NCC 2025']
  if (lowerInput.includes('qdc')) return DOCUMENT_STANDARDS['QDC 4.5']
  if (lowerInput.includes('as/nzs 3000')) return DOCUMENT_STANDARDS['AS/NZS 3000']
  if (lowerInput.includes('as/nzs 3500')) return DOCUMENT_STANDARDS['AS/NZS 3500']
  if (lowerInput.includes('as 1668')) return DOCUMENT_STANDARDS['AS 1668']
  if (lowerInput.includes('as/nzs 3666')) return DOCUMENT_STANDARDS['AS/NZS 3666']
  if (lowerInput.includes('consumer law')) return DOCUMENT_STANDARDS['Australian Consumer Law']
  if (lowerInput.includes('work health')) return DOCUMENT_STANDARDS['Work Health and Safety Act 2011']
  if (lowerInput.includes('insurance contract')) return DOCUMENT_STANDARDS['Insurance Contracts Act 1984']

  // No match found
  return null
}

/**
 * Parse section/clause notation
 *
 * Converts various notations to standard AGLC4 format
 */
export function parseSection(input: string): {
  sectionType: 'section' | 'chapter' | 'schedule' | 'division' | 'part'
  number: string
} | null {
  // Normalize input
  const normalized = input.trim().toLowerCase()

  // Match section patterns
  const sectionMatch = normalized.match(/^(?:s\.?|sec\.?|section)\s+(\d+(?:\.\d+)*)/i)
  if (sectionMatch) {
    return { sectionType: 'section', number: sectionMatch[1] }
  }

  // Match chapter patterns
  const chapterMatch = normalized.match(/^(?:ch\.?|chapter)\s+(\d+)/i)
  if (chapterMatch) {
    return { sectionType: 'chapter', number: chapterMatch[1] }
  }

  // Match schedule patterns
  const scheduleMatch = normalized.match(/^(?:sched\.?|schedule)\s+(\d+)/i)
  if (scheduleMatch) {
    return { sectionType: 'schedule', number: scheduleMatch[1] }
  }

  // Match division patterns
  const divisionMatch = normalized.match(/^(?:div\.?|division)\s+(\d+)/i)
  if (divisionMatch) {
    return { sectionType: 'division', number: divisionMatch[1] }
  }

  // Match part patterns
  const partMatch = normalized.match(/^(?:part)\s+(\d+|[A-Z])/i)
  if (partMatch) {
    return { sectionType: 'part', number: partMatch[1] }
  }

  // Try plain number
  if (/^\d+(?:\.\d+)*$/.test(normalized)) {
    return { sectionType: 'section', number: normalized }
  }

  return null
}

/**
 * Format section reference according to AGLC4
 *
 * AGLC4 uses 's' for section, 'ss' for multiple sections
 */
export function formatSectionReference(sectionType: string, number: string): string {
  switch (sectionType) {
    case 'section':
      return `s ${number}`
    case 'chapter':
      return `ch ${number}`
    case 'schedule':
      return `Sch ${number}`
    case 'division':
      return `div ${number}`
    case 'part':
      return `pt ${number}`
    default:
      return `s ${number}`
  }
}

/**
 * Format full AGLC4 citation
 *
 * Main public function for AGLC4 formatting
 */
export function formatCitationAGLC4(
  documentCode: string,
  sectionNumber?: string
): FormattedCitation {
  // Normalize document
  const docNorm = normalizeDocumentName(documentCode)

  if (!docNorm) {
    // Fallback for unknown documents
    return {
      fullReference: `${documentCode}${sectionNumber ? ` s ${sectionNumber}` : ''}`,
      shortReference: documentCode,
      inTextCitation: documentCode,
      footnoteCitation: `${documentCode}${sectionNumber ? ` s ${sectionNumber}` : ''}`
    }
  }

  // Format base citation
  let fullRef = `${docNorm.name}`
  let shortRef = docNorm.code

  // Add section if provided
  if (sectionNumber) {
    const sectionParsed = parseSection(sectionNumber)
    const formattedSection = sectionParsed
      ? formatSectionReference(sectionParsed.sectionType, sectionParsed.number)
      : `s ${sectionNumber}`

    fullRef += `, ${formattedSection}`
    shortRef += ` ${formattedSection}`
  }

  // Add jurisdiction
  if (docNorm.jurisdiction && docNorm.jurisdiction !== '(Cth)') {
    // Most citations don't include jurisdiction if it's Commonwealth
    fullRef = `${fullRef} ${docNorm.jurisdiction}`
  }

  return {
    fullReference: fullRef,
    shortReference: shortRef,
    inTextCitation: `(${shortRef})`,
    footnoteCitation: fullRef
  }
}

/**
 * Format multiple section ranges
 *
 * For citations like "ss 2.4–2.6"
 */
export function formatSectionRange(
  startSection: string,
  endSection: string
): string {
  // AGLC4 uses en-dash (–) not hyphen
  return `ss ${startSection}–${endSection}`
}

/**
 * Build full AGLC4 citation with context
 *
 * Includes quoted text if available
 */
export function buildFullAGLC4Citation(
  documentCode: string,
  sectionNumber: string,
  quotedText?: string,
  pageNumber?: string
): string {
  const citation = formatCitationAGLC4(documentCode, sectionNumber)

  let fullCitation = citation.fullReference

  if (pageNumber) {
    fullCitation += ` [${pageNumber}]`
  }

  if (quotedText) {
    fullCitation += ` '${quotedText}'`
  }

  return fullCitation
}

/**
 * Format pinpoint reference (specific page or subsection)
 *
 * AGLC4 uses square brackets for page numbers
 */
export function formatPinpoint(
  citation: string,
  pinpoint: string | number
): string {
  if (typeof pinpoint === 'number') {
    return `${citation} [${pinpoint}]`
  }
  return `${citation} [${pinpoint}]`
}

/**
 * Validate AGLC4 citation format
 *
 * Returns true if citation appears to follow AGLC4 format
 */
export function validateAGLC4Format(citation: string): {
  isValid: boolean
  issues: string[]
} {
  const issues: string[] = []

  // Check for proper spacing
  if (citation.includes('  ')) {
    issues.push('Double spaces found - use single spaces')
  }

  // Check for common format errors
  if (citation.includes('Sec.') || citation.includes('SEC.')) {
    issues.push('Use "s" not "Sec." for section in AGLC4')
  }

  if (citation.includes('§')) {
    issues.push('AGLC4 does not use § symbol - use "s"')
  }

  // Check for proper quotation marks (should be curly, but straight quotes acceptable)
  if (citation.includes('\'')) {
    // Straight quotes are acceptable
  }

  // Check jurisdiction format
  if (/(QLD|NSW|VIC|SA|WA|TAS|ACT|NT)\)/.test(citation)) {
    // Jurisdiction appears to be properly formatted
  }

  return {
    isValid: issues.length === 0,
    issues
  }
}

/**
 * Generate in-text citation (parenthetical form)
 *
 * For use in body text of documents
 */
export function generateInTextCitation(
  documentCode: string,
  sectionNumber?: string,
  yearOrPage?: string | number
): string {
  const citation = formatCitationAGLC4(documentCode, sectionNumber)

  if (yearOrPage) {
    return `(${citation.shortReference}, ${yearOrPage})`
  }

  return citation.inTextCitation
}

/**
 * Generate footnote citation (full form)
 *
 * For use in footnotes and references
 */
export function generateFootnoteCitation(
  documentCode: string,
  sectionNumber?: string,
  quotedText?: string
): string {
  const citation = formatCitationAGLC4(documentCode, sectionNumber)

  if (quotedText) {
    return `${citation.footnoteCitation} '${quotedText}'`
  }

  return citation.footnoteCitation
}

/**
 * Convert IICRC citation to comparable AGLC4 format
 *
 * Helps bridge IICRC standards with AGLC4 regulatory citations
 */
export function convertIIRCtoAGLC4(iicrCode: string, section: string): string {
  // IICRC standards like "IICRC S500" -> handle as Australian standard reference
  const normalized = iicrCode.replace(/IICRC\s+/i, '').trim()

  // Format as standard reference
  return `IICRC ${normalized}, s ${section}`
}

/**
 * Create a reference list entry (bibliography)
 *
 * For use in reference lists or bibliographies
 */
export function createBibliographyEntry(
  documentCode: string,
  publisherName?: string,
  yearPublished?: number
): string {
  const docNorm = normalizeDocumentName(documentCode)

  if (!docNorm) {
    return `${documentCode} ${yearPublished ? `(${yearPublished})` : ''}`
  }

  const parts: string[] = [docNorm.name]

  if (yearPublished) {
    parts.push(`(${yearPublished})`)
  }

  if (publisherName) {
    parts.push(publisherName)
  }

  return parts.join(' ')
}

/**
 * Format multi-part citation
 *
 * For documents with multiple parts or sections
 */
export function formatMultiPartCitation(
  documentCode: string,
  parts: Array<{
    type: 'section' | 'chapter' | 'schedule'
    number: string
  }>
): string {
  const citation = formatCitationAGLC4(documentCode)
  const partStrings = parts.map(p => formatSectionReference(p.type, p.number))

  return `${citation.shortReference} ${partStrings.join(', ')}`
}

/**
 * AGLC4 Quick Reference Card
 *
 * Common citation patterns for Australian regulations
 */
export const AGLC4_REFERENCE: Record<string, string> = {
  'Building Code National': 'National Construction Code 2025, ch [X]',
  'Building Code State': '[State] Building Code, s [X.X]',
  'Electrical Standard': 'AS/NZS 3000:2023, s [X.X]',
  'Plumbing Standard': 'AS/NZS 3500:2021, s [X.X]',
  'HVAC Standard': 'AS 1668.1:2002, s [X]',
  'Air System Standard': 'AS/NZS 3666:2011, s [X.X]',
  'Legislation': '[Act Name] [Year] (Cth), s [X]',
  'Consumer Law': 'Australian Consumer Law, Sch 2, Div [X]',
  'Work Health Safety': 'Work Health and Safety Act 2011 (Cth), s [X]',
  'Insurance': 'General Insurance Code of Practice, [clause X]',
}

/**
 * Format entire citation set for document
 *
 * Takes list of citations and formats them for inclusion in a document
 */
export function formatCitationSet(
  citations: Array<{
    document: string
    section: string
  }>,
  style: 'full' | 'short' | 'footnote' = 'full'
): string[] {
  return citations.map(c => {
    const formatted = formatCitationAGLC4(c.document, c.section)

    switch (style) {
      case 'short':
        return formatted.shortReference
      case 'footnote':
        return formatted.footnoteCitation
      case 'full':
      default:
        return formatted.fullReference
    }
  })
}
