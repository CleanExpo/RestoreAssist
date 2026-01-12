/**
 * Citation Formatter - AGLC4 and IICRC Citation Formatting
 * 
 * Formats citations according to AGLC4 (Australian Guide to Legal Citation, 4th edition)
 * and IICRC standard citation formats for use in professional reports.
 */

export interface FormattedCitation {
  fullReference: string      // Full citation (e.g., "IICRC S500 Section 14.3.2")
  shortReference: string     // Short form (e.g., "IICRC S500, s 14.3.2")
  inTextCitation: string     // Parenthetical citation (e.g., "(IICRC S500, s 14.3.2)")
  footnoteCitation: string    // Footnote format
  documentCode: string       // Standard identifier (e.g., "IICRC-S500")
  sectionNumber?: string     // Section reference (e.g., "14.3.2")
}

/**
 * Format IICRC standard citation
 */
export function formatIICRCCitation(
  standard: string,           // e.g., "S500", "S520"
  sectionNumber?: string,     // e.g., "14.3.2", "5.2"
  version?: string            // e.g., "2025"
): FormattedCitation {
  const standardCode = standard.toUpperCase().replace(/^IICRC\s*/i, '').replace(/^AS-IICRC\s*/i, '')
  const standardName = standardCode.startsWith('S') 
    ? `IICRC ${standardCode}` 
    : standardCode
  
  const versionSuffix = version ? `:${version}` : ''
  const sectionRef = sectionNumber 
    ? sectionNumber.match(/^s?\s*/i) 
      ? sectionNumber 
      : `Section ${sectionNumber}`
    : ''
  
  const fullReference = sectionRef 
    ? `${standardName}${versionSuffix} ${sectionRef}`
    : `${standardName}${versionSuffix}`
  
  const shortRef = sectionRef
    ? `${standardName}${versionSuffix}, ${sectionRef.replace(/^Section\s+/i, 's ')}`
    : `${standardName}${versionSuffix}`
  
  const inText = sectionRef
    ? `(${standardName}${versionSuffix}, ${sectionRef.replace(/^Section\s+/i, 's ')})`
    : `(${standardName}${versionSuffix})`
  
  const footnote = sectionRef
    ? `${standardName}${versionSuffix} ${sectionRef}`
    : `${standardName}${versionSuffix}`
  
  return {
    fullReference,
    shortReference: shortRef,
    inTextCitation: inText,
    footnoteCitation: footnote,
    documentCode: `IICRC-${standardCode}`,
    sectionNumber: sectionNumber?.replace(/^s?\s*/i, '')
  }
}

/**
 * Format Australian Standard (AS/NZS) citation
 */
export function formatASNZSCitation(
  standardNumber: string,     // e.g., "3000", "3500"
  year?: string,              // e.g., "2018", "2023"
  sectionNumber?: string,     // e.g., "2.4", "5.2"
  title?: string             // e.g., "Electrical Installations"
): FormattedCitation {
  const standardCode = standardNumber.replace(/^AS\/NZS\s*/i, '').trim()
  const yearSuffix = year ? `:${year}` : ''
  const fullName = title 
    ? `AS/NZS ${standardCode}${yearSuffix}, ${title}`
    : `AS/NZS ${standardCode}${yearSuffix}`
  
  const sectionRef = sectionNumber 
    ? sectionNumber.match(/^s?\s*/i)
      ? sectionNumber
      : `s ${sectionNumber}`
    : ''
  
  const fullReference = sectionRef
    ? `${fullName}, ${sectionRef}`
    : fullName
  
  const shortRef = sectionRef
    ? `AS/NZS ${standardCode}${yearSuffix}, ${sectionRef}`
    : `AS/NZS ${standardCode}${yearSuffix}`
  
  const inText = sectionRef
    ? `(AS/NZS ${standardCode}${yearSuffix}, ${sectionRef})`
    : `(AS/NZS ${standardCode}${yearSuffix})`
  
  const footnote = sectionRef
    ? `${fullName}, ${sectionRef}`
    : fullName
  
  return {
    fullReference,
    shortReference: shortRef,
    inTextCitation: inText,
    footnoteCitation: footnote,
    documentCode: `AS/NZS-${standardCode}${yearSuffix}`,
    sectionNumber: sectionNumber?.replace(/^s?\s*/i, '')
  }
}

/**
 * Format building code citation (NCC, QDC, etc.)
 */
export function formatBuildingCodeCitation(
  codeName: string,           // e.g., "NCC", "QDC 4.5"
  sectionNumber?: string,     // e.g., "3.2.1"
  jurisdiction?: string        // e.g., "(Qld)", "(NSW)"
): FormattedCitation {
  const code = codeName.toUpperCase()
  const fullName = code === 'NCC' 
    ? 'National Construction Code 2025'
    : code.startsWith('QDC')
    ? `Queensland Development Code ${code.replace(/^QDC\s*/i, '')}`
    : code
  
  const sectionRef = sectionNumber
    ? sectionNumber.match(/^s?\s*/i)
      ? sectionNumber
      : `s ${sectionNumber}`
    : ''
  
  const juris = jurisdiction || (code.startsWith('QDC') ? '(Qld)' : '')
  
  const fullReference = sectionRef
    ? `${fullName}, ${sectionRef}${juris ? ` ${juris}` : ''}`
    : `${fullName}${juris ? ` ${juris}` : ''}`
  
  const shortRef = sectionRef
    ? `${code}, ${sectionRef}${juris ? ` ${juris}` : ''}`
    : `${code}${juris ? ` ${juris}` : ''}`
  
  const inText = sectionRef
    ? `(${code}, ${sectionRef}${juris ? ` ${juris}` : ''})`
    : `(${code}${juris ? ` ${juris}` : ''})`
  
  const footnote = sectionRef
    ? `${fullName}, ${sectionRef}${juris ? ` ${juris}` : ''}`
    : `${fullName}${juris ? ` ${juris}` : ''}`
  
  return {
    fullReference,
    shortReference: shortRef,
    inTextCitation: inText,
    footnoteCitation: footnote,
    documentCode: code.replace(/\s+/g, '-'),
    sectionNumber: sectionNumber?.replace(/^s?\s*/i, '')
  }
}

/**
 * Format WHS/OH&S citation
 */
export function formatWHSCitation(
  actName: string,            // e.g., "Work Health and Safety Act"
  year?: string,              // e.g., "2011"
  sectionNumber?: string,     // e.g., "36"
  jurisdiction?: string        // e.g., "(Cth)", "(Qld)"
): FormattedCitation {
  const yearSuffix = year ? ` ${year}` : ''
  const juris = jurisdiction || '(Cth)'
  const sectionRef = sectionNumber
    ? sectionNumber.match(/^s?\s*/i)
      ? sectionNumber
      : `s ${sectionNumber}`
    : ''
  
  const fullName = `${actName}${yearSuffix}`
  
  const fullReference = sectionRef
    ? `${fullName} ${juris}, ${sectionRef}`
    : `${fullName} ${juris}`
  
  const shortRef = sectionRef
    ? `${actName}${yearSuffix} ${juris}, ${sectionRef}`
    : `${actName}${yearSuffix} ${juris}`
  
  const inText = sectionRef
    ? `(${actName}${yearSuffix} ${juris}, ${sectionRef})`
    : `(${actName}${yearSuffix} ${juris})`
  
  const footnote = sectionRef
    ? `${fullName} ${juris}, ${sectionRef}`
    : `${fullName} ${juris}`
  
  return {
    fullReference,
    shortReference: shortRef,
    inTextCitation: inText,
    footnoteCitation: footnote,
    documentCode: actName.replace(/\s+/g, '-').toUpperCase(),
    sectionNumber: sectionNumber?.replace(/^s?\s*/i, '')
  }
}

/**
 * Parse and format a citation from text
 * Attempts to identify the citation type and format it appropriately
 */
export function parseAndFormatCitation(citationText: string): FormattedCitation | null {
  if (!citationText || citationText.trim().length === 0) {
    return null
  }
  
  const text = citationText.trim()
  
  // IICRC S500/S520 patterns
  const iicrcMatch = text.match(/(?:IICRC|AS-IICRC)\s*(S\d{3})(?::(\d{4}))?\s*(?:Section|Sec|s\.?)?\s*(\d+(?:\.\d+)*)?/i)
  if (iicrcMatch) {
    return formatIICRCCitation(iicrcMatch[1], iicrcMatch[3], iicrcMatch[2])
  }
  
  // AS/NZS patterns
  const asnzsMatch = text.match(/AS\/NZS\s*(\d+(?:\:\d+)?)(?:\s*,\s*([^,]+))?(?:\s*,\s*(?:s\.?|Section)?\s*(\d+(?:\.\d+)*))?/i)
  if (asnzsMatch) {
    const [_, number, yearOrTitle, section] = asnzsMatch
    const yearMatch = number.match(/^(\d+):(\d{4})$/)
    if (yearMatch) {
      return formatASNZSCitation(yearMatch[1], yearMatch[2], section, asnzsMatch[2])
    }
    return formatASNZSCitation(number, undefined, section, asnzsMatch[2])
  }
  
  // Building code patterns (NCC, QDC)
  const buildingCodeMatch = text.match(/(NCC|QDC(?:\s*[\d.]+)?)(?:\s*,\s*(?:s\.?|Section)?\s*(\d+(?:\.\d+)*))?(?:\s*\(([^)]+)\))?/i)
  if (buildingCodeMatch) {
    return formatBuildingCodeCitation(buildingCodeMatch[1], buildingCodeMatch[2], buildingCodeMatch[3] ? `(${buildingCodeMatch[3]})` : undefined)
  }
  
  // WHS Act patterns
  const whsMatch = text.match(/(Work\s+Health\s+and\s+Safety\s+Act|WHS\s+Act)(?:\s+(\d{4}))?(?:\s*\(([^)]+)\))?(?:\s*,\s*(?:s\.?|Section)?\s*(\d+))?/i)
  if (whsMatch) {
    return formatWHSCitation(whsMatch[1], whsMatch[2], whsMatch[4], whsMatch[3] ? `(${whsMatch[3]})` : undefined)
  }
  
  return null
}

/**
 * Extract citations from text and return formatted citations
 */
export function extractAndFormatCitations(text: string): FormattedCitation[] {
  const citations: FormattedCitation[] = []
  
  // Common citation patterns
  const patterns = [
    // IICRC patterns
    /(?:IICRC|AS-IICRC)\s*S\d{3}(?::\d{4})?\s*(?:Section|Sec|s\.?)?\s*\d+(?:\.\d+)*/gi,
    // AS/NZS patterns
    /AS\/NZS\s*\d+(?::\d{4})?(?:\s*,\s*[^,]+)?(?:\s*,\s*(?:s\.?|Section)?\s*\d+(?:\.\d+)*)?/gi,
    // Building codes
    /(?:NCC|QDC(?:\s*[\d.]+)?)(?:\s*,\s*(?:s\.?|Section)?\s*\d+(?:\.\d+)*)?(?:\s*\([^)]+\))?/gi,
    // WHS Acts
    /(?:Work\s+Health\s+and\s+Safety\s+Act|WHS\s+Act)(?:\s+\d{4})?(?:\s*\([^)]+\))?(?:\s*,\s*(?:s\.?|Section)?\s*\d+)?/gi
  ]
  
  patterns.forEach(pattern => {
    const matches = text.match(pattern)
    if (matches) {
      matches.forEach(match => {
        const formatted = parseAndFormatCitation(match)
        if (formatted) {
          citations.push(formatted)
        }
      })
    }
  })
  
  // Remove duplicates
  const uniqueCitations = citations.filter((citation, index, self) =>
    index === self.findIndex(c => 
      c.documentCode === citation.documentCode && 
      c.sectionNumber === citation.sectionNumber
    )
  )
  
  return uniqueCitations
}

/**
 * Format citation for use in report text (in-text citation)
 */
export function formatInTextCitation(citation: FormattedCitation): string {
  return citation.inTextCitation
}

/**
 * Format citation for use in footnotes
 */
export function formatFootnoteCitation(citation: FormattedCitation): string {
  return citation.footnoteCitation
}

/**
 * Format citation for use in references list
 */
export function formatReferenceCitation(citation: FormattedCitation): string {
  return citation.fullReference
}
