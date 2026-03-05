/**
 * Enhanced Gap Analysis Engine
 * 
 * Analyzes completed claim PDFs against IICRC standards, Australian standards,
 * OH&S policies, and billing requirements to identify missing elements
 * Uses connected integrations and retrieves standards from Google Drive
 */

import Anthropic from '@anthropic-ai/sdk'
import { extractTextFromPDF } from './file-extraction'
import { retrieveRelevantStandards, buildStandardsContextPrompt, RetrievalQuery } from './standards-retrieval'
import { performRevolutionaryGapAnalysis } from './revolutionary-gap-analysis'
import { createCachedSystemPrompt, extractCacheMetrics, logCacheMetrics } from './anthropic/features/prompt-cache'

export interface GapAnalysisResult {
  fileName: string
  fileId: string
  issues: Array<{
    category: string
    elementName: string
    description: string
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    standardReference?: string
    isBillable?: boolean
    estimatedCost?: number
    estimatedHours?: number
    suggestedLineItem?: string
  }>
  missingElements: {
    iicrc: number
    australianStandards: number
    ohs: number
    whs: number
    scopeOfWorks: number
    billing: number
    documentation: number
    equipment: number
    monitoring: number
  }
  scores: {
    completeness: number
    compliance: number
    standardization: number
    scopeAccuracy: number
    billingAccuracy: number
  }
  estimatedMissingRevenue?: number
  standardsReferenced?: string[]
  complianceGaps?: string[]
  reportStructure?: {
    sections: string[]
    missingSections: string[]
    sectionOrder: string[]
    flowIssues: string[]
  }
  technicianPattern?: {
    reportingStyle: string
    commonOmissions: string[]
    strengths: string[]
    standardizationLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  }
  revolutionaryAnalysis?: unknown
}

/**
 * Perform enhanced gap analysis on a single PDF
 * Uses standards from Google Drive and comprehensive Australian standards
 */
async function analyzeSinglePDF(
  file: { id: string; name: string; buffer: Buffer },
  anthropicApiKey: string,
  standardsContext?: string
): Promise<GapAnalysisResult> {
  const anthropic = new Anthropic({ apiKey: anthropicApiKey })
  const base64Data = file.buffer.toString('base64')

  const systemPrompt = `You are a senior IICRC-certified water damage restoration consultant and compliance expert with 30+ years of experience in Australia. You are performing comprehensive gap analysis on completed claim reports to identify ALL missing elements, compliance gaps, and billable items.

Your analysis must be thorough and identify:
1. Missing IICRC compliance elements (with specific standard references)
2. Missing Australian standards compliance (AS/NZS, NCC, state codes)
3. Missing OH&S/WHS requirements (Work Health and Safety Act, Safe Work Australia)
4. Missing scope of works items that should be included
5. Missing billing items with estimated costs
6. Missing documentation requirements
7. Missing equipment justification and specifications
8. Missing monitoring and verification procedures

${standardsContext ? `\n**RELEVANT STANDARDS FROM IICRC GOOGLE DRIVE:**\n${standardsContext}\n` : ''}

**IICRC S500 Compliance Requirements (AS-IICRC S500:2025):**
- Water category classification (Category 1, 2, or 3) with source identification
- Water class determination (Class 1, 2, 3, or 4) with affected area calculations
- Source of water identification and contamination assessment
- Affected area documentation with measurements and materials
- Drying plan documentation with equipment selection justification
- Equipment selection and justification per IICRC standards
- Monitoring procedures with psychrometric readings
- Completion verification with moisture verification logs
- Safety hazards assessment and mitigation
- Psychrometric readings and environmental monitoring
- Material-specific drying protocols
- Structural drying procedures
- Content handling and restoration procedures

**Australian Standards Compliance:**
- AS-IICRC S500:2025 - Standard for Professional Water Damage Restoration
- AS-IICRC S520 - Standard for Professional Mold Remediation (if applicable)
- AS/NZS 3000:2018 - Electrical Installations (Wiring Rules) - for equipment power requirements
- AS/NZS 3500 - Plumbing and Drainage Standards
- AS 1668 - The use of ventilation and airconditioning in buildings
- AS/NZS 3666 - Air-handling and water systems of buildings
- AS 3959 - Construction of Buildings in Bushfire-Prone Areas (if applicable)
- AS 1684 - Residential Timber-Framed Construction
- AS 2870 - Residential Slabs and Footings
- National Construction Code (NCC) - Building Code of Australia
- State-specific building codes (e.g., QDC 4.5 for wet areas in Queensland)

**Australian OH&S/WHS Requirements:**
- Work Health and Safety Act 2011 (Commonwealth and State-specific)
- Safe Work Australia Guidelines
- Personal Protective Equipment (PPE) requirements and usage logs
- Hazard identification and risk assessment protocols
- Working at heights documentation and permits
- Confined spaces procedures and permits (AS 2865)
- Safety equipment (barriers, signage, ventilation) per WHS requirements
- Environmental controls and containment procedures
- Waste disposal procedures per state regulations
- Asbestos/lead testing and management (for pre-1990 buildings)
- Electrical safety standards (AS/NZS 3000) for equipment operation
- Site safety documentation and compliance records

**Scope of Works Requirements:**
- Detailed work breakdown structure
- Phase-by-phase work procedures
- Material removal and disposal procedures
- Structural drying procedures
- Content handling and restoration
- Cleaning and sanitization procedures
- Reconstruction and restoration procedures
- Quality control and verification procedures
- Timeline and scheduling
- Equipment requirements with specifications
- Material requirements and quantities
- Labor requirements and skill levels
- Subcontractor requirements (if applicable)

**Billing Items Often Missed (with typical Australian rates):**
- Setup/teardown time (0.5-2 hours @ $80-150/hr)
- Travel time and mileage (per km @ $0.68/km + time @ $80-150/hr)
- Equipment mobilization/demobilization (1-3 hours @ $80-150/hr)
- Administrative overhead (5-10% of project value)
- Quality control inspections (0.5-1 hour per inspection @ $100-150/hr)
- Documentation and reporting time (2-4 hours @ $100-150/hr)
- Emergency response premiums (20-50% surcharge)
- After-hours surcharges (1.5-2x standard rate)
- Weekend/public holiday surcharges (1.5-2x standard rate)
- Confined space premiums ($200-500 per entry)
- Working at heights premiums ($150-300 per day)
- PPE costs (per item: $20-100)
- Equipment rental (per day: $50-500 depending on equipment)
- Material costs (document all materials used)
- Waste disposal fees (per bin: $200-500)
- Environmental testing fees (asbestos, lead, mould: $300-800 per test)
- Structural engineering assessments (if required: $500-2000)
- Electrical safety inspections (if required: $200-500)
- HVAC system cleaning and restoration (if required: $500-2000)

**Report Structure Requirements:**
- Executive summary with key findings
- Property information (address, type, age, construction)
- Incident details (date, time, source, duration)
- Inspection findings with photos and measurements
- Damage assessment with material identification
- Scope of works with detailed procedures
- Equipment requirements with specifications and power calculations
- Timeline/phases with milestones
- Cost estimation with line items
- Compliance statements referencing all applicable standards
- Risk assessment and mitigation strategies
- Monitoring and verification procedures
- Completion criteria and verification methods

**Australian Insurance Standards:**
- General Insurance Code of Practice compliance
- Insurance Council of Australia (ICA) standards
- Policy wording compliance
- Claims documentation requirements
- Evidence preservation requirements
- Loss assessment procedures

Return ONLY a valid JSON object with comprehensive analysis.`

  const userPrompt = `Perform comprehensive gap analysis on this completed claim report PDF: ${file.name}

Analyze this report against:
1. IICRC Standards (AS-IICRC S500:2025, S520, etc.) - identify ALL missing compliance elements
2. Australian Standards (AS/NZS 3000, AS 1668, AS/NZS 3666, NCC, state codes) - identify ALL missing compliance
3. Australian OH&S/WHS Requirements (Work Health and Safety Act, Safe Work Australia) - identify ALL missing safety protocols
4. Scope of Works - identify ALL missing work items, procedures, and specifications
5. Billing Items - identify ALL missing billable items with realistic Australian cost estimates
6. Documentation Requirements - identify ALL missing documentation, photos, logs, and records

For EACH missing element, provide:
- Specific standard reference (e.g., "AS-IICRC S500 Section 14.3.2", "AS/NZS 3000:2018", "Work Health and Safety Act 2011")
- Why it's required and what risk it poses if missing
- Whether it's billable and estimated cost in AUD
- Severity level based on compliance risk

Calculate comprehensive scores (0-100):
- Completeness: How complete is the report structure and content?
- Compliance: How well does it comply with IICRC and Australian standards?
- Standardization: How well does it follow standardized procedures and formats?
- Scope Accuracy: How accurate and complete is the scope of works?
- Billing Accuracy: How complete is the billing with all billable items included?

Estimate total missing revenue potential (sum of all missing billable items).

**Report Structure and Flow Analysis:**
- Identify all sections present in the report
- Identify missing standard sections (Executive Summary, Property Information, Incident Details, Inspection Findings, Damage Assessment, Scope of Works, Equipment Requirements, Timeline/Phases, Cost Estimation, Compliance Statements, Monitoring & Documentation, Conclusion & Risk Factors)
- Analyze the order and flow of sections
- Identify flow issues (e.g., missing transitions, illogical ordering)

**Technician Pattern Analysis:**
- Analyze the technician's reporting style and approach
- Identify common omissions or patterns in what this technician misses
- Identify strengths (what they do well)
- Assess standardization level (how well they follow standard formats)

Return JSON with this exact structure:
{
  "fileName": "${file.name}",
  "fileId": "${file.id}",
  "issues": [
    {
      "category": "IICRC_COMPLIANCE|AUSTRALIAN_STANDARD|OH_S_POLICY|WHS_REQUIREMENT|SCOPE_OF_WORKS|BILLING_ITEM|DOCUMENTATION|EQUIPMENT_SPECIFICATION|MONITORING_PROCEDURE",
      "elementName": "Specific missing element name (e.g., 'Water Category Classification per AS-IICRC S500:2025 Section 10.2')",
      "description": "Detailed description of what is missing, why it's important, and what standard requires it",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "standardReference": "Exact standard reference (e.g., 'AS-IICRC S500:2025 Section 14.3.2', 'AS/NZS 3000:2018', 'Work Health and Safety Act 2011')",
      "isBillable": true/false,
      "estimatedCost": 0.00,
      "estimatedHours": 0.0,
      "suggestedLineItem": "Suggested billing line item description"
    }
  ],
  "missingElements": {
    "iicrc": 0,
    "australianStandards": 0,
    "ohs": 0,
    "whs": 0,
    "scopeOfWorks": 0,
    "billing": 0,
    "documentation": 0,
    "equipment": 0,
    "monitoring": 0
  },
  "scores": {
    "completeness": 0-100,
    "compliance": 0-100,
    "standardization": 0-100,
    "scopeAccuracy": 0-100,
    "billingAccuracy": 0-100
  },
  "estimatedMissingRevenue": 0.00,
  "standardsReferenced": ["List of standards that should have been referenced"],
  "complianceGaps": ["List of major compliance gaps identified"],
  "reportStructure": {
    "sections": ["List of sections found in the report"],
    "missingSections": ["List of standard sections that are missing"],
    "sectionOrder": ["Order of sections in the report"],
    "flowIssues": ["Issues with report flow and structure"]
  },
  "technicianPattern": {
    "reportingStyle": "Description of the technician's reporting style",
    "commonOmissions": ["Common elements this technician omits"],
    "strengths": ["What this technician does well"],
    "standardizationLevel": "LOW|MEDIUM|HIGH"
  }
}`

  try {
    // Use prompt caching for cost optimization (90% savings on cache hits)
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
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
    logCacheMetrics('GapAnalyzer', metrics, response.id)

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

    const result: GapAnalysisResult = JSON.parse(jsonMatch[0])
    return {
      ...result,
      fileId: file.id,
      fileName: file.name
    }

  } catch (error: any) {
    throw new Error(`Failed to analyze ${file.name}: ${error.message}`)
  }
}

/**
 * Perform enhanced gap analysis on multiple PDFs
 * Uses revolutionary comprehensive analysis for minute-level detail
 * Retrieves standards from Google Drive and processes in parallel
 */
export async function performGapAnalysis(
  pdfFiles: Array<{ id: string; name: string; buffer: Buffer }>,
  anthropicApiKey: string,
  standardsContext?: string
): Promise<GapAnalysisResult[]> {
  // Use revolutionary gap analysis for comprehensive minute-level analysis
  const results = await Promise.allSettled(
    pdfFiles.map(file => performRevolutionaryGapAnalysis(file, anthropicApiKey, standardsContext))
  )

  // Map revolutionary results to standard format for backward compatibility
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      const revResult = result.value
      // Convert revolutionary format to standard format
      return {
        fileName: revResult.fileName,
        fileId: revResult.fileId,
        issues: revResult.issues.map(issue => ({
          category: issue.category,
          elementName: issue.elementName,
          description: issue.description,
          severity: issue.severity,
          standardReference: issue.standardReference,
          isBillable: issue.isBillable,
          estimatedCost: issue.estimatedCost,
          estimatedHours: issue.estimatedHours,
          suggestedLineItem: issue.suggestedLineItem
        })),
        missingElements: revResult.missingElements,
        scores: {
          completeness: revResult.scores.completeness,
          compliance: revResult.scores.compliance,
          standardization: revResult.scores.standardization,
          scopeAccuracy: revResult.scores.scopeAccuracy,
          billingAccuracy: revResult.scores.billingAccuracy
        },
        estimatedMissingRevenue: revResult.estimatedMissingRevenue,
        standardsReferenced: revResult.standardsReferenced,
        complianceGaps: revResult.complianceGaps,
        reportStructure: revResult.reportStructure,
        technicianPattern: revResult.technicianPattern,
        // Add revolutionary data as additional fields
        revolutionaryAnalysis: revResult
      }
    } else {
      // Return error result
      return {
        fileName: pdfFiles[index].name,
        fileId: pdfFiles[index].id,
        issues: [],
        missingElements: {
          iicrc: 0,
          australianStandards: 0,
          ohs: 0,
          whs: 0,
          scopeOfWorks: 0,
          billing: 0,
          documentation: 0,
          equipment: 0,
          monitoring: 0
        },
        scores: {
          completeness: 0,
          compliance: 0,
          standardization: 0,
          scopeAccuracy: 0,
          billingAccuracy: 0
        },
        estimatedMissingRevenue: 0,
        standardsReferenced: [],
        complianceGaps: []
      }
    }
  })
}

