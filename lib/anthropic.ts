import Anthropic from '@anthropic-ai/sdk'
import { tryClaudeModels } from './anthropic-models'

// Create Anthropic client with user's API key
export function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey: apiKey,
  })
}

export interface ReportGenerationRequest {
  basicInfo: {
    title: string
    clientName: string
    propertyAddress: string
    dateOfLoss: string
    waterCategory: string
    waterClass: string
    hazardType: string
    insuranceType: string
  }
  remediationData: any
  dryingPlan: any
  equipmentSizing: any
  monitoringData: any
  insuranceData: any
}

export async function generateDetailedReport(
  data: ReportGenerationRequest,
  userApiKey: string
): Promise<string> {
  try {
    console.log('Starting AI report generation with user API key...')
    console.log('User API Key provided:', !!userApiKey)

    // Create client with user's API key
    const anthropic = createAnthropicClient(userApiKey)

    const prompt = createReportPrompt(data)

    const response = await tryClaudeModels(
      anthropic,
      {
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      }
    )

    console.log('AI response received:', response.content.length, 'content blocks')
    
    if (response.content[0].type === 'text') {
      console.log('Report generated successfully, length:', response.content[0].text.length)
      return response.content[0].text
    } else {
      console.error('Unexpected response type:', response.content[0].type)
      throw new Error('Unexpected response format from AI')
    }
  } catch (error) {
    console.error('Error generating report with Anthropic:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    throw new Error(`Failed to generate detailed report: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

function createReportPrompt(data: ReportGenerationRequest): string {
  return `
You are an expert IICRC S500 certified water damage restoration specialist. Generate a comprehensive, professional water damage restoration report based on the following information:

## BASIC INFORMATION
- Title: ${data.basicInfo.title}
- Client: ${data.basicInfo.clientName}
- Property Address: ${data.basicInfo.propertyAddress}
- Date of Loss: ${data.basicInfo.dateOfLoss}
- Water Category: ${data.basicInfo.waterCategory}
- Water Class: ${data.basicInfo.waterClass}
- Hazard Type: ${data.basicInfo.hazardType}
- Insurance Type: ${data.basicInfo.insuranceType}

## REMEDIATION PROCEDURES
${JSON.stringify(data.remediationData, null, 2)}

## DRYING PLAN
${JSON.stringify(data.dryingPlan, null, 2)}

## EQUIPMENT SIZING
${JSON.stringify(data.equipmentSizing, null, 2)}

## MONITORING DATA
${JSON.stringify(data.monitoringData, null, 2)}

## INSURANCE INFORMATION
${JSON.stringify(data.insuranceData, null, 2)}

Please generate a comprehensive, professional IICRC S500 compliant water damage restoration report that includes:

1. **EXECUTIVE SUMMARY** - Overview of the water damage incident, assessment findings, and recommended actions
2. **SITE ASSESSMENT** - Detailed evaluation of the affected areas, moisture levels, and structural conditions
3. **WATER CATEGORY & CLASS ANALYSIS** - Professional assessment of water contamination level and extent of damage
4. **REMEDIATION PROCEDURES** - Step-by-step decontamination and cleaning protocols
5. **DRYING PLAN** - Comprehensive moisture removal strategy with psychrometric calculations
6. **EQUIPMENT SPECIFICATIONS** - Detailed equipment requirements, placement, and operational parameters
7. **MONITORING PROTOCOLS** - Daily monitoring procedures, documentation requirements, and verification methods
8. **SAFETY CONSIDERATIONS** - Health and safety protocols, PPE requirements, and hazard mitigation
9. **TIMELINE & SCHEDULE** - Project timeline with milestones and completion targets
10. **COST ESTIMATION** - Detailed cost breakdown for labor, materials, and equipment
11. **INSURANCE COORDINATION** - Claims documentation and insurance company liaison procedures
12. **QUALITY ASSURANCE** - Final inspection criteria and completion standards
13. **RECOMMENDATIONS** - Preventive measures and future maintenance suggestions
14. **APPENDICES** - Supporting documentation, photos, and technical specifications

The report should be:
- Professional and comprehensive
- IICRC S500 compliant
- Technically accurate
- Client-friendly language where appropriate
- Include specific measurements, calculations, and technical details
- Follow industry best practices
- Include all necessary documentation for insurance claims

Format the report in a clear, professional structure with proper headings, bullet points, and technical specifications.
`
}
