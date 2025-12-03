/**
 * Standards Retrieval Service - Google Drive Integration
 * 
 * This service retrieves IICRC Standards from Google Drive
 * and uses Anthropic API to extract relevant information for report generation.
 * 
 * Folder: IICRC Standards (1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1)
 */

import Anthropic from '@anthropic-ai/sdk'
import { listDriveItems, downloadDriveFile, searchDriveFiles, getStandardsFolderId, DriveFile } from './google-drive'
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromTXT } from './file-extraction'

export interface StandardsContext {
  documents: Array<{
    name: string
    fileId: string
    relevantSections: string[]
    standardType: string // e.g., 'S500', 'S520', 'S400'
    extractedContent?: string
  }>
  summary: string
}

export interface RetrievalQuery {
  reportType: 'water' | 'mould' | 'fire' | 'commercial' | 'general'
  waterCategory?: '1' | '2' | '3'
  materials?: string[]
  affectedAreas?: string[]
  keywords?: string[]
  technicianNotes?: string
}

/**
 * Get Anthropic API key from environment or user integration
 */
function getAnthropicClient(apiKey?: string): Anthropic {
  const key = apiKey || process.env.ANTHROPIC_API_KEY
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is required for standards retrieval')
  }
  return new Anthropic({ apiKey: key })
}

/**
 * Determine which standards are relevant based on report context
 */
function determineRelevantStandards(query: RetrievalQuery): string[] {
  const standards: string[] = []
  
  // Always include S500 for water damage
  if (query.reportType === 'water') {
    standards.push('S500')
    standards.push('AS-IICRC S500')
    standards.push('IICRC S500')
    standards.push('Water Damage Restoration')
  }
  
  // Include S520 for mould
  if (query.reportType === 'mould') {
    standards.push('S520')
    standards.push('AS-IICRC S520')
    standards.push('IICRC S520')
    standards.push('Mould Remediation')
    standards.push('Mold Remediation')
  }
  
  // Include S400 for commercial
  if (query.reportType === 'commercial') {
    standards.push('S400')
    standards.push('IICRC S400')
    standards.push('Commercial')
  }
  
  // Always include general Australian standards
  standards.push('AS/NZS 3000') // Electrical
  standards.push('AS 1668') // HVAC
  standards.push('AS/NZS 3666') // Air systems
  standards.push('NCC') // National Construction Code
  standards.push('WHS') // Work Health and Safety
  standards.push('OH&S') // Occupational Health and Safety
  
  return standards
}

/**
 * Calculate relevance score for a file based on filename and query
 */
function calculateRelevanceScore(
  fileName: string,
  query: RetrievalQuery
): number {
  let score = 0
  const lowerFileName = fileName.toLowerCase()
  const relevantStandards = determineRelevantStandards(query)
  
  // Check for standard type matches
  relevantStandards.forEach(standard => {
    if (lowerFileName.includes(standard.toLowerCase())) {
      score += 15
    }
  })
  
  // Report type matching
  if (query.reportType === 'water' && (lowerFileName.includes('s500') || lowerFileName.includes('water'))) {
    score += 20
  }
  if (query.reportType === 'mould' && (lowerFileName.includes('s520') || lowerFileName.includes('mould') || lowerFileName.includes('mold'))) {
    score += 20
  }
  if (query.reportType === 'commercial' && (lowerFileName.includes('s400') || lowerFileName.includes('commercial'))) {
    score += 20
  }
  
  // Material matching
  if (query.materials) {
    query.materials.forEach(material => {
      if (lowerFileName.includes(material.toLowerCase())) {
        score += 5
      }
    })
  }
  
  // Keyword matching
  if (query.keywords) {
    query.keywords.forEach(keyword => {
      if (lowerFileName.includes(keyword.toLowerCase())) {
        score += 3
      }
    })
  }
  
  // Prefer files in specific standard folders
  if (lowerFileName.includes('s500') || lowerFileName.includes('s520') || lowerFileName.includes('s400')) {
    score += 10
  }
  
  return score
}

/**
 * Extract standard type from filename
 */
function extractStandardType(fileName: string): string {
  const lower = fileName.toLowerCase()
  
  if (lower.includes('s500') || lower.includes('water')) return 'S500'
  if (lower.includes('s520') || lower.includes('mould') || lower.includes('mold')) return 'S520'
  if (lower.includes('s400') || lower.includes('commercial')) return 'S400'
  if (lower.includes('s540') || lower.includes('trauma')) return 'S540'
  if (lower.includes('s100')) return 'S100'
  if (lower.includes('s220')) return 'S220'
  if (lower.includes('s300')) return 'S300'
  if (lower.includes('s410')) return 'S410'
  if (lower.includes('s700')) return 'S700'
  if (lower.includes('s800')) return 'S800'
  if (lower.includes('s900')) return 'S900'
  if (lower.includes('sop')) return 'SOP'
  
  return 'General'
}

/**
 * Use Anthropic API to extract relevant sections from document text
 */
async function extractRelevantSectionsWithAI(
  anthropic: Anthropic,
  documentText: string,
  fileName: string,
  query: RetrievalQuery
): Promise<string[]> {
  try {
    // Limit text length to avoid token limits (keep first 100k characters)
    const truncatedText = documentText.length > 100000 
      ? documentText.substring(0, 100000) + '\n\n[Document truncated...]'
      : documentText
    
    const relevantStandards = determineRelevantStandards(query)
    const keywords = [
      ...relevantStandards,
      ...(query.keywords || []),
      ...(query.materials || []),
    ]
    
    const systemPrompt = `You are an expert in IICRC standards and Australian building codes. Your task is to extract the most relevant sections from a standards document that relate to the given query context.

Extract 3-5 key sections or paragraphs that are most relevant to the query. For each section, provide:
1. A brief heading/title
2. The actual text content (preserve exact wording and standard references)
3. Why it's relevant to the query

Format your response as a numbered list, with each item containing:
- Section Title
- Relevant Text (exact quotes from the document)
- Relevance Explanation

Keep each section concise but complete enough to be useful for report generation.`

    const userPrompt = `Document: ${fileName}

Query Context:
- Report Type: ${query.reportType}
- Water Category: ${query.waterCategory || 'N/A'}
- Materials: ${query.materials?.join(', ') || 'N/A'}
- Keywords: ${keywords.join(', ')}
${query.technicianNotes ? `- Technician Notes: ${query.technicianNotes.substring(0, 500)}` : ''}

Document Content:
${truncatedText}

Extract the most relevant sections from this document that should be used when generating a ${query.reportType} damage restoration report. Focus on:
- Specific procedures and requirements
- Standard references and citations
- Compliance requirements
- Technical specifications
- Safety protocols
- Material-specific guidelines`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    })

    if (response.content[0].type === 'text') {
      const extractedText = response.content[0].text
      // Split into sections (assuming numbered list format)
      const sections = extractedText
        .split(/\d+\./)
        .filter(s => s.trim().length > 50) // Filter out very short sections
        .map(s => s.trim())
        .slice(0, 5) // Limit to 5 sections
      
      return sections.length > 0 ? sections : [extractedText.substring(0, 2000)]
    }
    
    return []
  } catch (error) {
    // Fallback: return a simple summary
    return [`Document contains relevant information about ${query.reportType} damage restoration`]
  }
}

/**
 * Retrieve relevant standards from Google Drive
 * Uses folder: IICRC Standards (1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1)
 */
export async function retrieveRelevantStandards(
  query: RetrievalQuery,
  anthropicApiKey?: string
): Promise<StandardsContext> {
  try {
    // Get standards folder ID (default: 1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1)
    const standardsFolderId = getStandardsFolderId()
    console.log(`[Standards Retrieval] Starting retrieval for report type: ${query.reportType}`)
    console.log(`[Standards Retrieval] Using Google Drive folder ID: ${standardsFolderId}`)
    
    // Get all files from the standards folder
    let allFiles: DriveFile[] = []
    
    try {
      // List files in the standards folder
      console.log(`[Standards Retrieval] Listing files in Google Drive folder...`)
      const folderItems = await listDriveItems(standardsFolderId)
      allFiles = folderItems.files
      console.log(`[Standards Retrieval] Found ${allFiles.length} files in folder`)
      
      // Also search for relevant files by keywords
      const relevantStandards = determineRelevantStandards(query)
      console.log(`[Standards Retrieval] Searching for relevant standards: ${relevantStandards.slice(0, 5).join(', ')}`)
      for (const standard of relevantStandards.slice(0, 5)) {
        try {
          const searchResults = await searchDriveFiles(standard, [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
          ])
          console.log(`[Standards Retrieval] Found ${searchResults.length} files matching "${standard}"`)
          allFiles.push(...searchResults)
        } catch (error: any) {
          console.error(`[Standards Retrieval] Error searching for "${standard}":`, error.message)
          // Continue with other searches
        }
      }
    } catch (error: any) {
      console.error(`[Standards Retrieval] Error accessing Google Drive:`, error.message)
      return {
        documents: [],
        summary: `Unable to access Google Drive folder "IICRC Standards": ${error.message}. Please check your Google Drive credentials and ensure the service account has access to the folder.`
      }
    }
    
    if (allFiles.length === 0) {
      return {
        documents: [],
        summary: 'No standards files found in Google Drive folder "IICRC Standards". Please ensure the folder contains PDF, DOCX, or TXT files.'
      }
    }
    
    // Score and rank files by relevance
    const scoredFiles = allFiles.map(file => ({
      file,
      score: calculateRelevanceScore(file.name, query)
    }))
    
    // Remove duplicates by file ID
    const uniqueFiles = new Map<string, typeof scoredFiles[0]>()
    for (const item of scoredFiles) {
      const existing = uniqueFiles.get(item.file.id)
      if (!existing || item.score > existing.score) {
        uniqueFiles.set(item.file.id, item)
      }
    }
    
    // Sort by score and take top 10 most relevant files
    const topFiles = Array.from(uniqueFiles.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(item => item.file)
    
    console.log(`[Standards Retrieval] Selected ${topFiles.length} most relevant files for processing`)
    topFiles.forEach((file, index) => {
      console.log(`[Standards Retrieval] ${index + 1}. ${file.name} (score: ${Array.from(uniqueFiles.values()).find(f => f.file.id === file.id)?.score || 0})`)
    })
    
    // Initialize Anthropic client
    let anthropic: Anthropic
    try {
      anthropic = getAnthropicClient(anthropicApiKey)
      console.log(`[Standards Retrieval] Anthropic API client initialized`)
    } catch (error) {
      console.error(`[Standards Retrieval] Error initializing Anthropic client:`, error)
      return {
        documents: [],
        summary: 'Unable to initialize Anthropic API client. Report will be generated using general knowledge.'
      }
    }
    
    // Extract text and relevant sections from top files
    // Process files sequentially to avoid overwhelming the API
    const documentsWithSections = []
    for (const file of topFiles) {
      console.log(`[Standards Retrieval] Processing file: ${file.name}`)
      try {
        // Download file from Google Drive
        console.log(`[Standards Retrieval] Downloading file: ${file.name} (${file.id})`)
        const { buffer, mimeType } = await downloadDriveFile(file.id)
        console.log(`[Standards Retrieval] Downloaded ${buffer.length} bytes, mimeType: ${mimeType}`)
        
        // Extract text based on file type
        let extractedText = ''
        if (mimeType === 'application/pdf' || file.mimeType === 'application/pdf') {
          console.log(`[Standards Retrieval] Extracting text from PDF...`)
          extractedText = await extractTextFromPDF(buffer)
        } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                   file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          console.log(`[Standards Retrieval] Extracting text from DOCX...`)
          extractedText = await extractTextFromDOCX(buffer)
        } else if (mimeType === 'text/plain' || file.mimeType === 'text/plain') {
          console.log(`[Standards Retrieval] Extracting text from TXT...`)
          extractedText = await extractTextFromTXT(buffer)
        } else {
          // Try to extract as text
          console.log(`[Standards Retrieval] Extracting as plain text...`)
          extractedText = buffer.toString('utf-8')
        }
        
        console.log(`[Standards Retrieval] Extracted ${extractedText.length} characters from ${file.name}`)
        
        if (!extractedText || extractedText.trim().length < 100) {
          console.log(`[Standards Retrieval] Skipping ${file.name} - insufficient text content`)
          continue
        }
        
        // Use AI to extract relevant sections
        console.log(`[Standards Retrieval] Using AI to extract relevant sections from ${file.name}...`)
        const relevantSections = await extractRelevantSectionsWithAI(
          anthropic,
          extractedText,
          file.name,
          query
        )
        
        console.log(`[Standards Retrieval] Extracted ${relevantSections.length} relevant sections from ${file.name}`)
        
        if (relevantSections.length === 0) {
          console.log(`[Standards Retrieval] Skipping ${file.name} - no relevant sections found`)
          continue
        }
        
        const standardType = extractStandardType(file.name)
        
        documentsWithSections.push({
          name: file.name,
          fileId: file.id,
          relevantSections,
          standardType,
          extractedContent: extractedText.substring(0, 5000) // Store first 5k chars for reference
        })
        
        console.log(`[Standards Retrieval] Successfully processed ${file.name} (${standardType})`)
        
        // Stop if we have enough documents (5-8 is usually sufficient)
        if (documentsWithSections.length >= 8) {
          console.log(`[Standards Retrieval] Reached maximum documents limit (8), stopping processing`)
          break
        }
      } catch (error: any) {
        console.error(`[Standards Retrieval] Error processing file ${file.name}:`, error.message)
        // Continue with next file
        continue
      }
    }
    
    // Generate summary
    const standardTypes = [...new Set(documentsWithSections.map(d => d.standardType))]
    const summary = `Retrieved ${documentsWithSections.length} relevant standards documents from Google Drive folder "IICRC Standards" covering: ${standardTypes.join(', ')}. ` +
      `Documents include information relevant to ${query.reportType} damage restoration, ` +
      `including applicable IICRC standards, Australian building codes, and safety regulations.`
    
    console.log(`[Standards Retrieval] Successfully retrieved ${documentsWithSections.length} documents: ${standardTypes.join(', ')}`)
    console.log(`[Standards Retrieval] Summary: ${summary}`)
    
    return {
      documents: documentsWithSections,
      summary
    }
  } catch (error: any) {
    console.error(`[Standards Retrieval] Fatal error:`, error.message, error.stack)
    return {
      documents: [],
      summary: `Unable to retrieve standards documents from Google Drive: ${error.message}. Report will be generated using general knowledge.`
    }
  }
}

/**
 * Build context prompt for report generation
 * This formats the retrieved standards for inclusion in the generation prompt
 */
export function buildStandardsContextPrompt(standardsContext: StandardsContext): string {
  if (standardsContext.documents.length === 0) {
    return ''
  }
  
  let prompt = '\n\n## RELEVANT STANDARDS AND REGULATIONS (FROM GOOGLE DRIVE - IICRC STANDARDS FOLDER)\n\n'
  prompt += standardsContext.summary + '\n\n'
  
  prompt += 'The following standards documents have been retrieved from the Google Drive folder "IICRC Standards" and are relevant to this report:\n\n'
  
  standardsContext.documents.forEach((doc, index) => {
    prompt += `${index + 1}. **${doc.name}** (${doc.standardType})\n`
    if (doc.relevantSections.length > 0) {
      prompt += `   Relevant Sections:\n`
      doc.relevantSections.forEach((section, sectionIndex) => {
        prompt += `   ${sectionIndex + 1}. ${section}\n\n`
      })
    }
    prompt += '\n'
  })
  
  prompt += '\nCRITICAL INSTRUCTIONS:\n'
  prompt += '- You MUST reference and cite specific sections from these standards documents\n'
  prompt += '- Use the exact standard numbers, section references, and terminology from these documents\n'
  prompt += '- Ensure all recommendations and procedures align with the requirements specified in these standards\n'
  prompt += '- Quote specific requirements, procedures, and compliance criteria from the extracted sections\n'
  prompt += '- Include standard references (e.g., "per IICRC S500 Section X", "as per AS-IICRC S500:2025") throughout the report\n\n'
  
  return prompt
}

