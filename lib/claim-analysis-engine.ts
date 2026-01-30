/**
 * Claim Analysis Engine
 *
 * Analyzes completed claim PDFs to:
 * 1. Understand report standards and quality
 * 2. Identify missing elements (IICRC, OH&S, billing)
 * 3. Understand report flow and technician differences
 * 4. Generate standardized templates
 */

import Anthropic from '@anthropic-ai/sdk'
import { extractTextFromPDF } from './file-extraction'
import { createCachedSystemPrompt, extractCacheMetrics, logCacheMetrics } from './anthropic/features/prompt-cache'

export interface ClaimAnalysisResult {
  // Extracted claim information
  claimNumber?: string
  propertyAddress?: string
  technicianName?: string
  inspectionDate?: string
  reportDate?: string
  clientName?: string
  insurerName?: string
  
  // Scores (0-100)
  completenessScore?: number
  complianceScore?: number
  standardizationScore?: number
  documentationScore?: number
  billingAccuracyScore?: number
  
  // Structure analysis
  reportStructure?: {
    sections: Array<{
      name: string
      present: boolean
      completeness: number
      order: number
    }>
    overallStructure: string
    missingSections: string[]
  }
  
  // Flow analysis
  reportFlow?: {
    logicalFlow: string
    transitions: string[]
    issues: string[]
    technicianPattern: string
  }
  
  // Missing elements
  missingElements: Array<{
    category: string
    elementType: string
    elementName: string
    description: string
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    standardReference?: string
    requirementText?: string
    isBillable?: boolean
    estimatedCost?: number
    estimatedHours?: number
    suggestedLineItem?: string
    context?: string
    suggestedValue?: string
  }>
  
  // Billing analysis
  billingAnalysis?: {
    lineItemsFound: number
    lineItemsMissing: number
    estimatedMissingRevenue: number
    missingCategories: string[]
  }
  
  // Full analysis data
  fullAnalysisData?: any
}

/**
 * Analyze a single claim PDF
 */
export async function analyzeClaimPDF(
  pdfBuffer: Buffer,
  fileName: string,
  apiKey: string,
  integrationName: string = 'Anthropic'
): Promise<ClaimAnalysisResult> {
  // Support multiple AI providers
  const anthropic = new Anthropic({ apiKey })
  
  // Try to extract text from PDF, but don't fail if it doesn't work
  // Claude can read PDFs directly, so we'll use that as fallback
  let extractedText = ''
  try {
    extractedText = await extractTextFromPDF(pdfBuffer)
  } catch (textError: any) {
    console.warn(`Text extraction failed for ${fileName}, will use PDF directly:`, textError.message)
    // Continue without extracted text - Claude can read the PDF directly
    extractedText = ''
  }
  
  // Convert PDF to base64 for Claude vision (Claude can read PDFs directly)
  const base64Data = pdfBuffer.toString('base64')
  
  const systemPrompt = `You are an expert water damage restoration consultant and IICRC-certified professional analyzing completed claim reports. Your task is to comprehensively analyze the report to:

1. **Understand Report Standards**: Evaluate the quality, completeness, and standardization level of the report
2. **Identify Missing Elements**: Find all missing compliance elements, safety requirements, and billable items
3. **Analyze Report Flow**: Understand the structure, flow, and technician patterns

**IICRC S500 Compliance Requirements to Check:**
- Water category classification (Category 1, 2, or 3)
- Water class determination (Class 1, 2, 3, or 4)
- Source of water identification
- Affected area documentation
- Drying plan documentation
- Equipment selection and justification
- Monitoring procedures
- Completion verification
- Safety hazards assessment
- Psychrometric readings
- Structural assessment

**OH&S and Safety Requirements to Check:**
- Working at heights documentation (permits, safety equipment)
- Confined spaces procedures and permits
- PPE requirements and usage logs
- Safety equipment (barriers, signage, ventilation)
- Environmental controls
- Waste disposal procedures
- Asbestos/lead testing (for pre-1990 buildings)
- Heat stress management
- Emergency procedures

**Billing Items Often Missed:**
- Setup/teardown time
- Travel time and mileage
- Equipment mobilization/demobilization
- Administrative overhead
- Quality control inspections
- Documentation and reporting time
- Emergency response premiums
- After-hours surcharges
- Confined space premiums
- Working at heights premiums
- PPE costs
- Waste disposal fees
- Environmental controls
- Safety equipment rental

**Report Structure Elements:**
- Executive summary
- Property information
- Incident details
- Inspection findings
- Damage assessment
- Scope of works
- Equipment requirements
- Timeline/phases
- Cost estimation
- Compliance statements
- Photos and documentation
- Signatures and approvals

Return a comprehensive JSON analysis with all findings.`

  const userPrompt = `Analyze this completed claim report PDF (filename: ${fileName}) and provide a comprehensive analysis.

**Extract the following information:**
1. Basic claim information (claim number, property address, technician name, dates, client, insurer)
2. Calculate scores (0-100) for:
   - Completeness: How complete is the report? Are all sections present?
   - Compliance: How well does it meet IICRC S500 and OH&S requirements?
   - Standardization: How well does it follow a standard format?
   - Documentation: Quality of documentation, photos, evidence
   - Billing Accuracy: Are all billable items included?

3. Analyze report structure:
   - What sections are present?
   - What sections are missing?
   - What is the order/structure?
   - How complete is each section?

4. Analyze report flow:
   - Is the logical flow clear?
   - Are transitions between sections smooth?
   - What issues exist in the flow?
   - What patterns indicate this technician's style?

5. Identify ALL missing elements:
   - IICRC compliance elements
   - OH&S requirements
   - Working at heights documentation
   - Confined spaces procedures
   - PPE requirements
   - Billing items that should be included
   - Documentation gaps
   - Scope of works items
   - Job costing elements

   For each missing element, provide:
   - Category
   - Element type and name
   - Description
   - Severity (CRITICAL, HIGH, MEDIUM, LOW)
   - Standard reference (if applicable)
   - Whether it's billable
   - Estimated cost/hours if billable
   - Suggested line item description
   - Context (where it should appear)
   - Suggested value/content

6. Billing analysis:
   - How many line items are present?
   - What line items are missing?
   - Estimate potential missing revenue
   - What categories are missing?

Return the analysis as a JSON object matching this structure:
{
  "claimNumber": "...",
  "propertyAddress": "...",
  "technicianName": "...",
  "inspectionDate": "YYYY-MM-DD",
  "reportDate": "YYYY-MM-DD",
  "clientName": "...",
  "insurerName": "...",
  "completenessScore": 0-100,
  "complianceScore": 0-100,
  "standardizationScore": 0-100,
  "documentationScore": 0-100,
  "billingAccuracyScore": 0-100,
  "reportStructure": {
    "sections": [...],
    "overallStructure": "...",
    "missingSections": [...]
  },
  "reportFlow": {
    "logicalFlow": "...",
    "transitions": [...],
    "issues": [...],
    "technicianPattern": "..."
  },
  "missingElements": [...],
  "billingAnalysis": {
    "lineItemsFound": 0,
    "lineItemsMissing": 0,
    "estimatedMissingRevenue": 0,
    "missingCategories": [...]
  }
}`

  try {
    // Use prompt caching for cost optimization (90% savings on cache hits)
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: [createCachedSystemPrompt(systemPrompt)],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Data
              }
            },
            {
              type: 'text',
              text: userPrompt
            }
          ]
        }
      ]
    })

    // Log cache metrics
    const metrics = extractCacheMetrics(response)
    logCacheMetrics('ClaimAnalyzer', metrics, response.id)

    if (!response.content || response.content.length === 0) {
      throw new Error('Claude returned empty response')
    }

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response format from Claude')
    }

    // Parse JSON from response
    let jsonText = content.text.trim()
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '')
    
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response')
    }

    const analysisResult: ClaimAnalysisResult = JSON.parse(jsonMatch[0])
    
    // Add extracted text to result
    analysisResult.fullAnalysisData = {
      ...analysisResult,
      extractedText: extractedText ? extractedText.substring(0, 50000) : 'Text extraction not available - PDF analyzed directly by Claude' // Limit size
    }

    return analysisResult
  } catch (error: any) {
    throw new Error(`Failed to analyze claim PDF: ${error.message}`)
  }
}

/**
 * Generate standardized template from multiple analyses
 */
export async function generateStandardTemplate(
  analyses: ClaimAnalysisResult[],
  templateType: 'INITIAL_INSPECTION_REPORT' | 'SCOPE_OF_WORKS' | 'JOB_COSTING',
  apiKey: string,
  integrationName: string = 'Anthropic'
): Promise<any> {
  const anthropic = new Anthropic({ apiKey })
  
  // Aggregate common patterns and missing elements
  const commonSections = new Map<string, number>()
  const commonMissingElements = new Map<string, number>()
  const technicianPatterns: string[] = []
  
  analyses.forEach(analysis => {
    analysis.reportStructure?.sections.forEach(section => {
      if (section.present) {
        commonSections.set(section.name, (commonSections.get(section.name) || 0) + 1)
      }
    })
    
    analysis.missingElements.forEach(element => {
      const key = `${element.category}:${element.elementName}`
      commonMissingElements.set(key, (commonMissingElements.get(key) || 0) + 1)
    })
    
    if (analysis.reportFlow?.technicianPattern) {
      technicianPatterns.push(analysis.reportFlow.technicianPattern)
    }
  })
  
  const systemPrompt = `You are an expert in creating standardized templates for water damage restoration reports. Based on analysis of multiple completed claims, create a national standardized template that:

1. Includes all essential sections found in quality reports
2. Addresses all commonly missing elements
3. Follows IICRC S500 standards
4. Includes OH&S requirements
5. Ensures all billable items are captured
6. Creates a logical, professional flow

The template should be comprehensive, professional, and ensure nothing is missed.`

  const userPrompt = `Based on analysis of ${analyses.length} completed claims, create a standardized ${templateType} template.

**Common sections found:** ${Array.from(commonSections.entries()).map(([name, count]) => `${name} (${count}/${analyses.length})`).join(', ')}

**Commonly missing elements:** ${Array.from(commonMissingElements.entries()).slice(0, 20).map(([key, count]) => `${key} (${count}/${analyses.length})`).join(', ')}

**Technician patterns observed:** ${technicianPatterns.slice(0, 5).join('; ')}

Create a comprehensive template structure with:
- Required sections in optimal order
- Required fields for each section
- Checklist of compliance elements
- Standard line items for billing
- Quality control checkpoints

Return as JSON with structure, checklist, and line items.`

  try {
    // Use prompt caching for cost optimization (90% savings on cache hits)
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: [createCachedSystemPrompt(systemPrompt)],
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    })

    // Log cache metrics
    const metrics = extractCacheMetrics(response)
    logCacheMetrics('ClaimTemplateGenerator', metrics, response.id)

    if (!response.content || response.content.length === 0) {
      throw new Error('Claude returned empty response')
    }

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response format from Claude')
    }

    let jsonText = content.text.trim()
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '')
    
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response')
    }

    return JSON.parse(jsonMatch[0])
  } catch (error: any) {
    throw new Error(`Failed to generate standard template: ${error.message}`)
  }
}

