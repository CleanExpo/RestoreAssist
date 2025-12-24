/**
 * Gap Analysis Engine
 * 
 * Analyzes completed claim PDFs to identify missing elements and issues
 * Returns analysis for all PDFs in a single call
 */

import Anthropic from '@anthropic-ai/sdk'
import { extractTextFromPDF } from './file-extraction'

export interface GapAnalysisResult {
  fileName: string
  fileId: string
  issues: Array<{
    category: string
    elementName: string
    description: string
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    isBillable?: boolean
    estimatedCost?: number
  }>
  missingElements: {
    iicrc: number
    ohs: number
    billing: number
    documentation: number
  }
  scores: {
    completeness: number
    compliance: number
    standardization: number
  }
  estimatedMissingRevenue?: number
}

/**
 * Perform gap analysis on a single PDF
 */
async function analyzeSinglePDF(
  file: { id: string; name: string; buffer: Buffer },
  anthropicApiKey: string
): Promise<GapAnalysisResult> {
  const anthropic = new Anthropic({ apiKey: anthropicApiKey })
  const base64Data = file.buffer.toString('base64')

  const systemPrompt = `You are an expert water damage restoration consultant performing gap analysis on completed claim reports. Identify ALL missing elements and issues.

**IICRC S500 Compliance Requirements:**
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

**OH&S Requirements:**
- Working at heights documentation
- Confined spaces procedures and permits
- PPE requirements and usage logs
- Safety equipment (barriers, signage, ventilation)
- Environmental controls
- Waste disposal procedures
- Asbestos/lead testing (for pre-1990 buildings)

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

**Report Structure:**
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

Return ONLY a valid JSON object.`

  const userPrompt = `Perform gap analysis on this completed claim report PDF: ${file.name}

Identify:
1. ALL missing IICRC compliance elements
2. ALL missing OH&S requirements
3. ALL missing billing items (with estimated costs)
4. ALL missing documentation
5. Calculate scores (0-100): completeness, compliance, standardization
6. Estimate missing revenue potential

Return JSON with this exact structure:
{
  "fileName": "${file.name}",
  "fileId": "${file.id}",
  "issues": [
    {
      "category": "IICRC_COMPLIANCE|OH_S_POLICY|BILLING_ITEM|DOCUMENTATION",
      "elementName": "Specific missing element name",
      "description": "What is missing and why it's important",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "isBillable": true/false,
      "estimatedCost": 0.00
    }
  ],
  "missingElements": {
    "iicrc": 0,
    "ohs": 0,
    "billing": 0,
    "documentation": 0
  },
  "scores": {
    "completeness": 0-100,
    "compliance": 0-100,
    "standardization": 0-100
  },
  "estimatedMissingRevenue": 0.00
}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
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
 * Perform gap analysis on multiple PDFs (processes in parallel for speed)
 */
export async function performGapAnalysis(
  pdfFiles: Array<{ id: string; name: string; buffer: Buffer }>,
  anthropicApiKey: string
): Promise<GapAnalysisResult[]> {
  // Process all PDFs in parallel for maximum speed
  const results = await Promise.allSettled(
    pdfFiles.map(file => analyzeSinglePDF(file, anthropicApiKey))
  )

  // Map results, handling failures gracefully
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value
    } else {
      // Return error result
      return {
        fileName: pdfFiles[index].name,
        fileId: pdfFiles[index].id,
        issues: [],
        missingElements: {
          iicrc: 0,
          ohs: 0,
          billing: 0,
          documentation: 0
        },
        scores: {
          completeness: 0,
          compliance: 0,
          standardization: 0
        },
        estimatedMissingRevenue: 0
      }
    }
  })
}

