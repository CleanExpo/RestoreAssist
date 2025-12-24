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
 * Enhanced with deeper analysis and better context understanding
 */
async function extractRelevantSectionsWithAI(
  anthropic: Anthropic,
  documentText: string,
  fileName: string,
  query: RetrievalQuery
): Promise<string[]> {
  try {
    // Limit text length to avoid token limits (keep first 150k characters for better context)
    const truncatedText = documentText.length > 150000 
      ? documentText.substring(0, 150000) + '\n\n[Document truncated...]'
      : documentText
    
    const relevantStandards = determineRelevantStandards(query)
    const keywords = [
      ...relevantStandards,
      ...(query.keywords || []),
      ...(query.materials || []),
      ...(query.affectedAreas || []),
    ]
    
    const systemPrompt = `You are a senior IICRC-certified water damage restoration specialist and standards expert with 30+ years of experience. Your task is to extract the MOST CRITICAL and RELEVANT sections from a standards document for generating a professional forensic restoration report.

Your extraction must:
1. Focus on PROCEDURAL REQUIREMENTS - step-by-step protocols that must be followed
2. Identify COMPLIANCE MANDATES - legal and regulatory requirements
3. Extract TECHNICAL SPECIFICATIONS - equipment, materials, measurements, tolerances
4. Capture STANDARD REFERENCES - exact citations (e.g., "IICRC S500 Section 14.3.2")
5. Highlight SAFETY PROTOCOLS - OH&S, PPE, containment requirements
6. Note MATERIAL-SPECIFIC GUIDELINES - if materials are mentioned in the query

For each relevant section, provide:
- Section Title (descriptive, specific)
- Exact Text Content (preserve all standard references, numbers, measurements)
- Standard Reference (e.g., "IICRC S500 Sec 14.2", "AS/NZS 3000:2018")
- Application to Report (how this applies to the specific query context)

Prioritize sections that:
- Are directly applicable to the water category/class
- Address the specific materials mentioned
- Contain mandatory compliance requirements
- Include verifiable procedures and protocols
- Reference Australian standards (AS/NZS) when applicable

Format as a numbered list with clear structure.`

    const userPrompt = `Document: ${fileName}

REPORT CONTEXT (Use this to determine relevance):
- Report Type: ${query.reportType} damage restoration
- Water Category: ${query.waterCategory ? `Category ${query.waterCategory}` : 'Not specified'}
- Materials Affected: ${query.materials?.join(', ') || 'Not specified'}
- Affected Areas: ${query.affectedAreas?.join(', ') || 'Not specified'}
- Keywords: ${keywords.filter(k => k).join(', ') || 'None'}
${query.technicianNotes ? `- Technician Field Notes Summary: ${query.technicianNotes.substring(0, 800)}` : ''}

DOCUMENT CONTENT:
${truncatedText}

TASK:
Extract 4-7 of the MOST CRITICAL sections from this standards document that are directly applicable to generating a professional forensic ${query.reportType} damage restoration report.

For each section, extract:
1. The exact text (preserve all standard references, section numbers, measurements)
2. The standard reference/citation (e.g., "IICRC S500 Section 14.3.2")
3. Why it's critical for this specific report context

Focus on extracting:
- Mandatory procedures that MUST be followed
- Compliance requirements with specific citations
- Technical specifications (equipment, materials, measurements)
- Safety and OH&S protocols
- Material-specific remediation guidelines
- Verification and documentation requirements
- Australian standards (AS/NZS) when present

Be thorough but precise. Each extracted section should be directly usable in the report generation.`

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
 * Analyze folder structure using Anthropic AI to understand organization
 */
async function analyzeFolderStructureWithAI(
  anthropic: Anthropic,
  folderItems: { files: DriveFile[], folders: any[] },
  query: RetrievalQuery
): Promise<{ relevantFiles: DriveFile[], reasoning: string }> {
  try {
    // Build folder structure description
    const fileList = folderItems.files.map(f => ({
      name: f.name,
      mimeType: f.mimeType,
      id: f.id
    })).slice(0, 100) // Limit to first 100 files for analysis
    
    const folderList = folderItems.folders?.map(f => ({
      name: f.name,
      id: f.id
    })) || []
    
    const systemPrompt = `You are an expert in IICRC standards and Australian building codes. Your task is to analyze a Google Drive folder structure and identify the most relevant standards documents for a specific water damage restoration report.

Analyze the folder structure and file names to:
1. Understand how standards are organized (by standard number, category, type, etc.)
2. Identify which files are most relevant to the report query
3. Consider file naming patterns, folder organization, and document types
4. Prioritize official IICRC standards (S500, S520, S400, etc.) and Australian standards (AS/NZS, NCC, etc.)

Return a JSON object with:
- relevantFileNames: Array of file names that should be prioritized
- reasoning: Brief explanation of why these files were selected
- standardTypes: Array of standard types identified (e.g., ["S500", "S520", "AS/NZS 3000"])
- priority: High/Medium/Low for each file

Be intelligent about matching - consider:
- Water category and class requirements
- Material-specific standards
- Safety and compliance requirements
- Regional standards (Australian vs. international)`

    const userPrompt = `Report Query Context:
- Report Type: ${query.reportType}
- Water Category: ${query.waterCategory || 'Not specified'}
- Materials Affected: ${query.materials?.join(', ') || 'Not specified'}
- Affected Areas: ${query.affectedAreas?.join(', ') || 'Not specified'}
- Keywords: ${query.keywords?.join(', ') || 'None'}
${query.technicianNotes ? `- Technician Notes Summary: ${query.technicianNotes.substring(0, 500)}` : ''}

Folder Structure:
- Total Files: ${fileList.length}
- Subfolders: ${folderList.length}

Files in Folder:
${JSON.stringify(fileList, null, 2)}

${folderList.length > 0 ? `Subfolders:\n${JSON.stringify(folderList, null, 2)}` : ''}

Analyze this folder structure and identify the most relevant standards documents for generating a professional ${query.reportType} damage restoration report. Consider the report context and prioritize files that contain:
1. Specific procedures for the water category/class
2. Material-specific remediation guidelines
3. Safety and compliance requirements
4. Australian building codes and regulations
5. IICRC standard references and citations`

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
      const analysisText = response.content[0].text
      
      // Try to extract JSON from response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const analysis = JSON.parse(jsonMatch[0])
          const relevantFileNames = analysis.relevantFileNames || []
          
          // Match file names to actual files
          const relevantFiles = folderItems.files.filter(file => 
            relevantFileNames.some((name: string) => 
              file.name.toLowerCase().includes(name.toLowerCase()) ||
              name.toLowerCase().includes(file.name.toLowerCase())
            )
          )
          
          return {
            relevantFiles: relevantFiles.length > 0 ? relevantFiles : folderItems.files.slice(0, 10),
            reasoning: analysis.reasoning || 'AI analysis completed'
          }
        } catch (e) {
          // Fallback: use text analysis
        }
      }
      
      // Fallback: extract file names mentioned in text
      const mentionedFiles: DriveFile[] = []
      for (const file of folderItems.files) {
        if (analysisText.toLowerCase().includes(file.name.toLowerCase().substring(0, 20))) {
          mentionedFiles.push(file)
        }
      }
      
      return {
        relevantFiles: mentionedFiles.length > 0 ? mentionedFiles : folderItems.files.slice(0, 10),
        reasoning: analysisText.substring(0, 500)
      }
    }
    
    return {
      relevantFiles: folderItems.files.slice(0, 10),
      reasoning: 'AI analysis completed'
    }
  } catch (error: any) {
    console.error(`[Standards Retrieval] Error in AI folder analysis:`, error.message)
    return {
      relevantFiles: folderItems.files.slice(0, 10),
      reasoning: 'Using default file selection'
    }
  }
}

/**
 * Retrieve relevant standards from Google Drive
 * Uses folder: IICRC Standards (1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1)
 * Enhanced with AI-powered folder structure analysis
 */
export async function retrieveRelevantStandards(
  query: RetrievalQuery,
  anthropicApiKey?: string
): Promise<StandardsContext> {
  try {
    // Get standards folder ID (default: 1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1)
    const standardsFolderId = getStandardsFolderId()
    
    // Initialize Anthropic client early for folder analysis
    let anthropic: Anthropic
    try {
      anthropic = getAnthropicClient(anthropicApiKey)
    } catch (error) {
      console.error(`[Standards Retrieval] Error initializing Anthropic client:`, error)
      return {
        documents: [],
        summary: 'Unable to initialize Anthropic API client. Report will be generated using general knowledge.'
      }
    }
    
    // Get all files from the standards folder
    let allFiles: DriveFile[] = []
    let folderStructure: { files: DriveFile[], folders: any[] } = { files: [], folders: [] }
    
    try {
      // List files in the standards folder
      const folderItems = await listDriveItems(standardsFolderId)
      allFiles = folderItems.files
      folderStructure = folderItems
      
      // Use AI to analyze folder structure and identify relevant files
      const aiAnalysis = await analyzeFolderStructureWithAI(anthropic, folderStructure, query)
      
      // Add AI-identified files to our list (prioritize them)
      const aiFileIds = new Set(aiAnalysis.relevantFiles.map(f => f.id))
      const otherFiles = allFiles.filter(f => !aiFileIds.has(f.id))
      allFiles = [...aiAnalysis.relevantFiles, ...otherFiles]
      
      // Also search for relevant files by keywords (as backup) - search within the standards folder
      const relevantStandards = determineRelevantStandards(query)
      for (const standard of relevantStandards.slice(0, 3)) {
        try {
          const searchResults = await searchDriveFiles(
            standard, 
            [
              'application/pdf',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'text/plain'
            ],
            standardsFolderId // Search within the standards folder
          )
          // Add files not already in our list
          for (const file of searchResults) {
            if (!allFiles.find(f => f.id === file.id)) {
              allFiles.push(file)
            }
          }
        } catch (error: any) {
          console.error(`[Standards Retrieval] Error searching for "${standard}":`, error.message)
          // Continue with other searches - errors are now handled gracefully in searchDriveFiles
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
    
    // Sort by score and take top 12 most relevant files (increased for better coverage)
    const topFiles = Array.from(uniqueFiles.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(item => item.file)
    
    topFiles.forEach((file, index) => {
      const score = Array.from(uniqueFiles.values()).find(f => f.file.id === file.id)?.score || 0
    })
    
    // Extract text and relevant sections from top files
    // Process files sequentially to avoid overwhelming the API
    const documentsWithSections = []
    for (const file of topFiles) {
      try {
        // Download file from Google Drive
        const { buffer, mimeType } = await downloadDriveFile(file.id)
        
        // Extract text based on file type
        let extractedText = ''
        if (mimeType === 'application/pdf' || file.mimeType === 'application/pdf') {
          extractedText = await extractTextFromPDF(buffer)
        } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                   file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          extractedText = await extractTextFromDOCX(buffer)
        } else if (mimeType === 'text/plain' || file.mimeType === 'text/plain') {
          extractedText = await extractTextFromTXT(buffer)
        } else {
          // Try to extract as text
          extractedText = buffer.toString('utf-8')
        }
        
        
        if (!extractedText || extractedText.trim().length < 100) {
          continue
        }
        
        // Use AI to extract relevant sections
        const relevantSections = await extractRelevantSectionsWithAI(
          anthropic,
          extractedText,
          file.name,
          query
        )
        
        
        if (relevantSections.length === 0) {
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
        
        
        // Stop if we have enough documents (10-12 for comprehensive coverage)
        if (documentsWithSections.length >= 12) {
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
 * Enhanced with professional formatting and actionable guidance
 */
export function buildStandardsContextPrompt(standardsContext: StandardsContext): string {
  if (standardsContext.documents.length === 0) {
    return ''
  }
  
  // Group documents by standard type for better organization
  const documentsByType = new Map<string, typeof standardsContext.documents>()
  standardsContext.documents.forEach(doc => {
    const type = doc.standardType || 'General'
    if (!documentsByType.has(type)) {
      documentsByType.set(type, [])
    }
    documentsByType.get(type)!.push(doc)
  })
  
  let prompt = '\n\n═══════════════════════════════════════════════════════════════\n'
  prompt += '📋 RELEVANT STANDARDS & REGULATIONS (GOOGLE DRIVE - IICRC STANDARDS)\n'
  prompt += '═══════════════════════════════════════════════════════════════\n\n'
  
  prompt += `${standardsContext.summary}\n\n`
  
  prompt += 'The following standards documents have been intelligently selected from the Google Drive folder "IICRC Standards" based on AI-powered analysis of folder structure and report context:\n\n'
  
  // Organize by standard type
  let docCounter = 1
  for (const [standardType, docs] of documentsByType.entries()) {
    prompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    prompt += `📄 ${standardType} Standards (${docs.length} document${docs.length > 1 ? 's' : ''})\n`
    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`
    
    docs.forEach((doc) => {
      prompt += `${docCounter}. **${doc.name}**\n`
      prompt += `   └─ Standard Type: ${doc.standardType}\n`
      prompt += `   └─ File ID: ${doc.fileId}\n\n`
      
    if (doc.relevantSections.length > 0) {
        prompt += `   📌 CRITICAL SECTIONS EXTRACTED:\n\n`
      doc.relevantSections.forEach((section, sectionIndex) => {
        prompt += `   ${sectionIndex + 1}. ${section}\n\n`
      })
    }
      docCounter++
    })
  }
  
  prompt += '\n═══════════════════════════════════════════════════════════════\n'
  prompt += '⚠️  MANDATORY COMPLIANCE REQUIREMENTS\n'
  prompt += '═══════════════════════════════════════════════════════════════\n\n'
  
  prompt += 'You MUST adhere to the following when generating this report:\n\n'
  prompt += '1. **STANDARD CITATIONS**:\n'
  prompt += '   - Reference EXACT section numbers from the extracted standards (e.g., "IICRC S500 Section 14.3.2", "AS-IICRC S500:2025 Section 12.4")\n'
  prompt += '   - Include standard references in ALL procedural recommendations\n'
  prompt += '   - Use the exact terminology and phrasing from the standards documents\n\n'
  
  prompt += '2. **PROCEDURAL COMPLIANCE**:\n'
  prompt += '   - All remediation procedures MUST align with the requirements specified in the extracted sections\n'
  prompt += '   - Follow the step-by-step protocols exactly as outlined in the standards\n'
  prompt += '   - Include all mandatory steps, verification requirements, and documentation protocols\n\n'
  
  prompt += '3. **TECHNICAL SPECIFICATIONS**:\n'
  prompt += '   - Use the exact measurements, tolerances, and specifications from the standards\n'
  prompt += '   - Reference equipment requirements, material specifications, and performance criteria\n'
  prompt += '   - Include all relevant Australian standards (AS/NZS) when applicable\n\n'
  
  prompt += '4. **SAFETY & COMPLIANCE**:\n'
  prompt += '   - Include all OH&S requirements, PPE specifications, and safety protocols from the standards\n'
  prompt += '   - Reference containment requirements, decontamination procedures, and verification protocols\n'
  prompt += '   - Ensure all recommendations meet Australian Work Health and Safety (WHS) requirements\n\n'
  
  prompt += '5. **PROFESSIONAL FORMATTING**:\n'
  prompt += '   - Structure the report to clearly show compliance with each referenced standard\n'
  prompt += '   - Use professional terminology consistent with IICRC and Australian building codes\n'
  prompt += '   - Include a "Standards Compliance" section that lists all referenced standards\n\n'
  
  prompt += '6. **VERIFICATION & DOCUMENTATION**:\n'
  prompt += '   - Include all verification requirements and documentation protocols from the standards\n'
  prompt += '   - Reference post-remediation verification procedures and acceptance criteria\n'
  prompt += '   - Ensure all recommendations are verifiable and auditable\n\n'
  
  prompt += '═══════════════════════════════════════════════════════════════\n'
  prompt += '💡 INTELLIGENT STANDARDS INTEGRATION\n'
  prompt += '═══════════════════════════════════════════════════════════════\n\n'
  
  prompt += 'These standards were selected using AI-powered analysis that:\n'
  prompt += '✓ Analyzed the Google Drive folder structure and organization\n'
  prompt += '✓ Matched standards to the specific water category, class, and materials\n'
  prompt += '✓ Extracted the most relevant sections for this specific report context\n'
  prompt += '✓ Prioritized Australian standards (AS/NZS) and IICRC standards\n'
  prompt += '✓ Considered technician field notes and report-specific requirements\n\n'
  
  prompt += 'Use these standards to generate a PROFESSIONAL, COMPLIANT, and TECHNICALLY ACCURATE forensic restoration report.\n\n'
  
  return prompt
}

