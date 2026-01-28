/**
 * Revolutionary Gap Analysis Engine
 * 
 * Next-level comprehensive gap analysis that compares documents against
 * ALL standards used in inspection reports and provides detailed rectification steps
 * 
 * This system revolutionizes the field by providing minute-level analysis
 * of every aspect of a restoration report against Australian and IICRC standards
 */

import Anthropic from '@anthropic-ai/sdk'
import { extractTextFromPDF } from './file-extraction'
import { retrieveRelevantStandards, buildStandardsContextPrompt, RetrievalQuery } from './standards-retrieval'
import { createCachedSystemPrompt, extractCacheMetrics, logCacheMetrics } from './anthropic/features/prompt-cache'

export interface RevolutionaryGapAnalysisResult {
  fileName: string
  fileId: string
  
  // Comprehensive section-by-section analysis
  sectionAnalysis: {
    sectionName: string
    present: boolean
    completeness: number // 0-100
    missingElements: string[]
    nonCompliantElements: string[]
    standardReferences: string[]
    rectificationSteps: Array<{
      step: string
      priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
      standardReference: string
      estimatedTime: string
      estimatedCost?: number
    }>
  }[]
  
  // Detailed issues with rectification
  issues: Array<{
    category: string
    section: string
    elementName: string
    description: string
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    standardReference: string
    currentState: string // What's currently in the document
    requiredState: string // What should be there
    rectificationSteps: string[] // Step-by-step how to fix
    isBillable: boolean
    estimatedCost?: number
    estimatedHours?: number
    suggestedLineItem?: string
    complianceRisk: string // Risk if not rectified
  }>
  
  // Standards compliance matrix
  standardsCompliance: Array<{
    standard: string
    standardNumber: string
    complianceLevel: number // 0-100
    missingRequirements: string[]
    presentRequirements: string[]
    criticalGaps: string[]
    rectificationPriority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  }>
  
  // Missing elements by category
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
    insurance: number
    hvac: number
    electrical: number
    materials: number
  }
  
  // Comprehensive scores
  scores: {
    completeness: number
    compliance: number
    standardization: number
    scopeAccuracy: number
    billingAccuracy: number
    documentationQuality: number
    technicalAccuracy: number
    safetyCompliance: number
    insuranceCompliance: number
  }
  
  // Revenue analysis
  estimatedMissingRevenue?: number
  billableItemsMissing: Array<{
    item: string
    category: string
    estimatedCost: number
    estimatedHours: number
    frequency: string
    justification: string
  }>
  
  // Report structure analysis
  reportStructure: {
    sections: string[]
    missingSections: string[]
    sectionOrder: string[]
    flowIssues: string[]
    recommendedStructure: string[]
  }
  
  // Technician pattern analysis
  technicianPattern: {
    reportingStyle: string
    commonOmissions: string[]
    strengths: string[]
    standardizationLevel: 'LOW' | 'MEDIUM' | 'HIGH'
    trainingNeeds: string[]
    bestPracticesToAdopt: string[]
  }
  
  // Rectification roadmap
  rectificationRoadmap: {
    immediateActions: Array<{
      action: string
      priority: 'CRITICAL' | 'HIGH'
      standardReference: string
      estimatedTime: string
      estimatedCost?: number
    }>
    shortTermImprovements: Array<{
      improvement: string
      priority: 'HIGH' | 'MEDIUM'
      standardReference: string
      estimatedTime: string
      estimatedCost?: number
    }>
    longTermEnhancements: Array<{
      enhancement: string
      priority: 'MEDIUM' | 'LOW'
      standardReference: string
      estimatedTime: string
      estimatedCost?: number
    }>
  }
  
  // Standards referenced
  standardsReferenced: string[]
  complianceGaps: string[]
}

/**
 * Standard report sections that MUST be present
 */
const REQUIRED_REPORT_SECTIONS = [
  'Report Header',
  'Executive Summary',
  'Date of Attendance',
  'Client Contacted',
  'Weather/Seasonal Context',
  'Areas Affected',
  'Standards & Compliance',
  'Material Identification',
  'Procedures Completed',
  'Specific Drying Recommendations',
  'Equipment and Power Requirements',
  'OH&S Compliance',
  'Insurance Claim Limitations',
  'HVAC and Air Systems Assessment',
  'Electrical Systems Assessment',
  'Monitoring & Documentation',
  'Conclusion & Risk Factors',
  'Psychrometric Assessment',
  'Loss Details',
  'Scope of Works',
  'Cost Estimation',
  'Timeline/Phases'
]

/**
 * All Australian and IICRC standards that must be checked
 */
const ALL_STANDARDS_TO_CHECK = [
  // IICRC Standards
  'AS-IICRC S500:2025',
  'IICRC S500 Standard',
  'AS-IICRC S520',
  'IICRC S520 Standard',
  'IICRC S540 Standard',
  'IICRC RIA Standards',
  
  // Australian Standards
  'AS/NZS 3000:2018',
  'AS/NZS 3500',
  'AS 1668',
  'AS/NZS 3666',
  'AS 3959',
  'AS 1684',
  'AS 2870',
  'AS 2865', // Confined spaces
  'AS/NZS 3012',
  
  // Building Codes
  'National Construction Code (NCC)',
  'Queensland Development Code (QDC)',
  'Building Code of Australia',
  
  // OH&S/WHS
  'Work Health and Safety Act 2011',
  'Safe Work Australia Guidelines',
  'State-specific WHS Acts',
  
  // Insurance
  'General Insurance Code of Practice',
  'Insurance Council of Australia (ICA) standards',
  'APRA guidelines',
  
  // HVAC
  'ASHRAE standards',
  'Indoor air quality standards',
  
  // Environmental
  'State-specific environmental protection laws',
  'Water discharge regulations',
  'Waste disposal requirements'
]

/**
 * Perform revolutionary comprehensive gap analysis
 */
export async function performRevolutionaryGapAnalysis(
  file: { id: string; name: string; buffer: Buffer },
  anthropicApiKey: string,
  standardsContext?: string
): Promise<RevolutionaryGapAnalysisResult> {
  const anthropic = new Anthropic({ apiKey: anthropicApiKey })
  const base64Data = file.buffer.toString('base64')

  const comprehensiveSystemPrompt = `You are the world's leading expert in water damage restoration compliance, with 40+ years of experience in Australia. You are performing a REVOLUTIONARY, MINUTE-LEVEL gap analysis that will transform the restoration industry.

Your task is to perform the most comprehensive analysis possible by:

1. **Section-by-Section Analysis**: Analyze EVERY section of the report against the standard template
2. **Standards Compliance Matrix**: Check compliance against ALL Australian and IICRC standards
3. **Rectification Roadmap**: Provide detailed, actionable steps to fix EVERY issue
4. **Revenue Recovery**: Identify ALL missing billable items with accurate cost estimates
5. **Technical Accuracy**: Verify all technical claims, calculations, and procedures
6. **Safety Compliance**: Ensure 100% compliance with OH&S/WHS requirements
7. **Insurance Compliance**: Verify all insurance documentation requirements

${standardsContext ? `\n**STANDARDS FROM GOOGLE DRIVE (USE THESE AS PRIMARY REFERENCE):**\n${standardsContext}\n` : ''}

**ALL STANDARDS TO CHECK:**
${ALL_STANDARDS_TO_CHECK.map(s => `- ${s}`).join('\n')}

**REQUIRED REPORT SECTIONS:**
${REQUIRED_REPORT_SECTIONS.map(s => `- ${s}`).join('\n')}

**FOR EACH SECTION, CHECK:**
- Is the section present?
- Is it complete (all required subsections)?
- Are all required standards referenced?
- Are all required data points included?
- Is the technical content accurate?
- Are calculations correct?
- Are measurements documented?
- Are photos/logs referenced?
- Is compliance explicitly stated?

**FOR EACH STANDARD, CHECK:**
- Is the standard referenced?
- Are specific sections cited?
- Are requirements met?
- What's missing?
- What's non-compliant?
- What's the compliance risk?

**FOR EACH MISSING ELEMENT, PROVIDE:**
- Exact standard reference with section number
- Current state (what's in the document)
- Required state (what should be there)
- Step-by-step rectification instructions
- Priority level
- Estimated time to fix
- Estimated cost (if billable)
- Compliance risk if not fixed

**BILLING ANALYSIS:**
Identify ALL missing billable items including:
- Setup/teardown (0.5-2h @ $80-150/hr)
- Travel (km @ $0.68/km + time @ $80-150/hr)
- Equipment mobilization (1-3h @ $80-150/hr)
- Admin overhead (5-10% of project)
- QC inspections (0.5-1h @ $100-150/hr)
- Documentation (2-4h @ $100-150/hr)
- Emergency premiums (20-50% surcharge)
- After-hours (1.5-2x rate)
- Weekend/holiday (1.5-2x rate)
- Confined space ($200-500/entry)
- Working at heights ($150-300/day)
- PPE ($20-100/item)
- Equipment rental ($50-500/day)
- Materials (document all)
- Waste disposal ($200-500/bin)
- Environmental testing ($300-800/test)
- Engineering assessments ($500-2000)
- Electrical inspections ($200-500)
- HVAC cleaning ($500-2000)

Return ONLY valid JSON.`

  const comprehensiveUserPrompt = `Perform REVOLUTIONARY gap analysis on: ${file.name}

Analyze this document with MINUTE-LEVEL detail:

1. **Section-by-Section Analysis**: For each of the ${REQUIRED_REPORT_SECTIONS.length} required sections:
   - Is it present? (yes/no)
   - Completeness score (0-100)
   - List ALL missing elements
   - List ALL non-compliant elements
   - List ALL standard references that should be included
   - Provide detailed rectification steps with priorities

2. **Standards Compliance Matrix**: For each of the ${ALL_STANDARDS_TO_CHECK.length} standards:
   - Compliance level (0-100)
   - Missing requirements
   - Present requirements
   - Critical gaps
   - Rectification priority

3. **Detailed Issues**: For EVERY issue found:
   - Category and section
   - Element name
   - Description
   - Severity
   - Standard reference (with section number)
   - Current state (what's actually in the document)
   - Required state (what should be there per standards)
   - Step-by-step rectification instructions
   - Is billable? Cost? Hours?
   - Compliance risk

4. **Revenue Analysis**: 
   - Total missing revenue
   - List ALL missing billable items with costs, hours, frequency, justification

5. **Report Structure**:
   - Sections found
   - Missing sections
   - Section order
   - Flow issues
   - Recommended structure

6. **Technician Pattern**:
   - Reporting style
   - Common omissions
   - Strengths
   - Standardization level
   - Training needs
   - Best practices to adopt

7. **Rectification Roadmap**:
   - Immediate actions (CRITICAL/HIGH priority)
   - Short-term improvements (HIGH/MEDIUM priority)
   - Long-term enhancements (MEDIUM/LOW priority)
   - Each with: action, priority, standard reference, time, cost

Return JSON with this EXACT structure:
{
  "fileName": "${file.name}",
  "fileId": "${file.id}",
  "sectionAnalysis": [
    {
      "sectionName": "Section name",
      "present": true/false,
      "completeness": 0-100,
      "missingElements": ["list"],
      "nonCompliantElements": ["list"],
      "standardReferences": ["list"],
      "rectificationSteps": [
        {
          "step": "Detailed step",
          "priority": "CRITICAL|HIGH|MEDIUM|LOW",
          "standardReference": "Standard with section",
          "estimatedTime": "X hours",
          "estimatedCost": 0.00
        }
      ]
    }
  ],
  "issues": [
    {
      "category": "Category",
      "section": "Section name",
      "elementName": "Element name",
      "description": "Description",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "standardReference": "Standard with section number",
      "currentState": "What's currently in document",
      "requiredState": "What should be there",
      "rectificationSteps": ["Step 1", "Step 2", ...],
      "isBillable": true/false,
      "estimatedCost": 0.00,
      "estimatedHours": 0.0,
      "suggestedLineItem": "Line item description",
      "complianceRisk": "Risk description"
    }
  ],
  "standardsCompliance": [
    {
      "standard": "Standard name",
      "standardNumber": "Standard number",
      "complianceLevel": 0-100,
      "missingRequirements": ["list"],
      "presentRequirements": ["list"],
      "criticalGaps": ["list"],
      "rectificationPriority": "CRITICAL|HIGH|MEDIUM|LOW"
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
    "monitoring": 0,
    "insurance": 0,
    "hvac": 0,
    "electrical": 0,
    "materials": 0
  },
  "scores": {
    "completeness": 0-100,
    "compliance": 0-100,
    "standardization": 0-100,
    "scopeAccuracy": 0-100,
    "billingAccuracy": 0-100,
    "documentationQuality": 0-100,
    "technicalAccuracy": 0-100,
    "safetyCompliance": 0-100,
    "insuranceCompliance": 0-100
  },
  "estimatedMissingRevenue": 0.00,
  "billableItemsMissing": [
    {
      "item": "Item name",
      "category": "Category",
      "estimatedCost": 0.00,
      "estimatedHours": 0.0,
      "frequency": "Frequency",
      "justification": "Why it should be billed"
    }
  ],
  "reportStructure": {
    "sections": ["list"],
    "missingSections": ["list"],
    "sectionOrder": ["list"],
    "flowIssues": ["list"],
    "recommendedStructure": ["list"]
  },
  "technicianPattern": {
    "reportingStyle": "Description",
    "commonOmissions": ["list"],
    "strengths": ["list"],
    "standardizationLevel": "LOW|MEDIUM|HIGH",
    "trainingNeeds": ["list"],
    "bestPracticesToAdopt": ["list"]
  },
  "rectificationRoadmap": {
    "immediateActions": [
      {
        "action": "Action description",
        "priority": "CRITICAL|HIGH",
        "standardReference": "Standard reference",
        "estimatedTime": "X hours",
        "estimatedCost": 0.00
      }
    ],
    "shortTermImprovements": [...],
    "longTermEnhancements": [...]
  },
  "standardsReferenced": ["list"],
  "complianceGaps": ["list"]
}`

  try {
    // Use prompt caching for cost optimization (90% savings on cache hits)
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16384, // Maximum tokens for comprehensive analysis
      system: [createCachedSystemPrompt(comprehensiveSystemPrompt)],
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
              text: comprehensiveUserPrompt
            }
          ]
        }
      ]
    })

    // Log cache metrics
    const metrics = extractCacheMetrics(response)
    logCacheMetrics('RevolutionaryGapAnalyzer', metrics, response.id)

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

    const result: RevolutionaryGapAnalysisResult = JSON.parse(jsonMatch[0])
    return {
      ...result,
      fileId: file.id,
      fileName: file.name
    }

  } catch (error: any) {
    throw new Error(`Failed to perform revolutionary gap analysis on ${file.name}: ${error.message}`)
  }
}

