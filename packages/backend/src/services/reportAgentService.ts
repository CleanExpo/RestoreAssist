// TEMPORARY: Disabled until @anthropic-ai/claude-agent-sdk is available
// import { Agent } from '@anthropic-ai/claude-agent-sdk';
import { GenerateReportRequest, GeneratedReport, ReportItem } from '../types';

/**
 * Report Agent Service - Production AI Agents for Damage Assessment
 *
 * CURRENTLY DISABLED: Awaiting @anthropic-ai/claude-agent-sdk package
 * This service will use Claude Agent SDK to generate unique, data-driven reports
 * for each restoration job. Each job creates a sandboxed agent environment
 * that pulls real data to generate:
 * - Initial damage assessment reports
 * - Restoration protocols
 * - Scopes of work
 * - Cost estimates
 *
 * NO TWO JOBS ARE ALIKE - agents adapt to each unique situation.
 */

// Placeholder type until SDK is available
type Agent = any;

const AUSTRALIAN_STANDARDS = {
  NSW: 'NSW Building Code + NCC 2022',
  VIC: 'Victorian Building Regulations + NCC 2022',
  QLD: 'Queensland Building Code + NCC 2022',
  WA: 'WA Building Regulations + NCC 2022',
  SA: 'SA Development Regulations + NCC 2022',
  TAS: 'Tasmanian Building Regulations + NCC 2022',
  ACT: 'ACT Building Regulations + NCC 2022',
  NT: 'NT Building Regulations + NCC 2022',
};

export class ReportAgentService {
  /**
   * Create a dedicated agent for a specific job/claim
   * This creates a sandboxed environment with the job's unique context
   * CURRENTLY DISABLED - Returns null until SDK is available
   */
  private createJobAgent(request: GenerateReportRequest): Agent {
    const standards = AUSTRALIAN_STANDARDS[request.state];

    // DISABLED: Uncomment when @anthropic-ai/claude-agent-sdk is available
    /*
    return new Agent({
      name: `RestoreAssist Job Agent - ${request.claimNumber || 'New Job'}`,
      model: 'claude-opus-4-20250514',

      systemPrompt: `You are an expert Australian disaster restoration assessor specializing in ${request.damageType} damage in ${request.state}.

**YOUR MISSION:**
Generate a comprehensive, accurate damage assessment report based on REAL DATA from this specific job. Every job is unique - analyze the specific details provided and create a customized report.

**COMPLIANCE STANDARDS:**
You must comply with: ${standards}

**CRITICAL REQUIREMENTS:**
1. **Use REAL DATA Only**: Base everything on the actual job details provided
2. **No Generic Templates**: Create unique content for this specific situation
3. **Accurate Pricing**: Use current Australian market rates for ${request.state}
4. **Complete Scope**: Cover ALL work required for THIS specific damage
5. **Professional Standards**: Meet insurance and regulatory requirements

**OUTPUT STRUCTURE:**
Your report must include:
- Professional damage assessment summary
- Step-by-step restoration protocol
- Detailed scope of work
- Itemized cost estimate (Labor, Materials, Equipment, Disposal)
- Compliance and safety notes specific to ${request.state}
- Authority to Proceed document

**DATA-DRIVEN APPROACH:**
- Analyze the property type and construction
- Assess the specific damage described
- Consider environmental factors (water source, contamination, etc.)
- Account for access and safety requirements
- Calculate realistic timelines
- Price according to ${request.state} market rates`,

      tools: ['bash', 'file', 'web_search'],

      // Enable MCP servers for data access
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()]
        }
      }
    });
    */

    return null as any; // Placeholder until SDK is available
  }

  /**
   * Generate complete damage assessment report using AI agent
   * CURRENTLY DISABLED - Returns error until SDK is available
   */
  async generateReport(request: GenerateReportRequest): Promise<GeneratedReport> {
    console.warn('⚠️ Agent service not available - @anthropic-ai/claude-agent-sdk not installed');
    console.warn('   Falling back to legacy ClaudeService');

    throw new Error('Agent service temporarily unavailable - use ClaudeService instead (set useAgent=false)');
  }

  /**
   * Build job-specific prompt with all real data
   */
  private buildJobPrompt(request: GenerateReportRequest): string {
    return `Generate a comprehensive damage assessment report for this restoration job:

**PROPERTY INFORMATION:**
- Address: ${request.propertyAddress}
- State: ${request.state}
- Type: ${request.propertyType || 'Residential'}

**DAMAGE DETAILS:**
- Type: ${request.damageType}
- Description: ${request.damageDescription}
- Severity: ${request.severity || 'Assessment Required'}
- Affected Areas: ${request.affectedAreas?.join(', ') || 'To be assessed'}

**CLIENT & CLAIM:**
${request.clientName ? `- Client Name: ${request.clientName}` : ''}
${request.clientContact ? `- Contact: ${request.clientContact}` : ''}
${request.insuranceCompany ? `- Insurance Company: ${request.insuranceCompany}` : ''}
${request.claimNumber ? `- Claim Number: ${request.claimNumber}` : ''}
${request.assessorName ? `- Assessor: ${request.assessorName}` : ''}

**ADDITIONAL CONTEXT:**
${request.photos ? `- Photos Available: ${request.photos.length} images` : ''}
${request.floorPlan ? '- Floor Plan: Available' : ''}
${request.previousWork ? `- Previous Work: ${request.previousWork}` : ''}
${request.specialRequirements ? `- Special Requirements: ${request.specialRequirements}` : ''}

**INSTRUCTIONS:**
1. Analyze this SPECIFIC situation - not a generic template
2. Create a detailed restoration protocol for THIS damage type
3. Build a comprehensive scope of work based on REAL needs
4. Generate accurate cost estimates using current ${request.state} rates
5. Include all compliance requirements for ${request.state}
6. Write a professional Authority to Proceed document

Return your assessment as a JSON object with this structure:
{
  "summary": "Professional assessment of this specific job (3-5 sentences)",
  "restorationProtocol": ["Step 1: Emergency response", "Step 2: ...", ...],
  "scopeOfWork": ["Detailed work item 1", "Detailed work item 2", ...],
  "itemizedEstimate": [
    {
      "description": "Specific work item with details",
      "quantity": [number],
      "unit": "sqm|lm|hours|each",
      "unitCost": [realistic AUD rate],
      "totalCost": [calculated total],
      "category": "Labor|Materials|Equipment|Disposal",
      "notes": "Any special considerations"
    }
  ],
  "complianceNotes": ["${request.state}-specific compliance requirement", ...],
  "safetyRequirements": ["Safety measure 1", ...],
  "timeline": {
    "emergency": "Timeframe for emergency response",
    "restoration": "Timeframe for full restoration",
    "completion": "Expected completion date"
  },
  "authorityToProceed": "Professional ATP document text for client signature"
}

IMPORTANT:
- Use REAL data from the job description
- Be SPECIFIC to this property and damage
- Use ACCURATE pricing for ${request.state}
- Include ALL necessary work items
- Make it PROFESSIONAL and COMPLETE

Return ONLY valid JSON, no markdown.`;
  }

  /**
   * Parse agent output into GeneratedReport format
   */
  private parseAgentOutput(agentResult: any, request: GenerateReportRequest): GeneratedReport {
    try {
      // Extract the agent's response
      let responseText = '';

      if (typeof agentResult === 'string') {
        responseText = agentResult;
      } else if (agentResult.output) {
        responseText = agentResult.output;
      } else if (agentResult.content) {
        responseText = Array.isArray(agentResult.content)
          ? agentResult.content[0]?.text || JSON.stringify(agentResult.content)
          : agentResult.content;
      }

      // Clean and parse JSON
      let cleanedText = responseText.trim();
      cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      const parsed = JSON.parse(cleanedText);

      // Calculate total cost
      const totalCost = parsed.itemizedEstimate.reduce(
        (sum: number, item: ReportItem) => sum + (item.totalCost || 0),
        0
      );

      // Build the complete report
      return {
        reportId: `RPT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        propertyAddress: request.propertyAddress,
        damageType: request.damageType,
        state: request.state,
        summary: parsed.summary,
        severity: parsed.severity || request.severity || 'moderate',
        urgent: parsed.urgent || false,
        recommendations: parsed.recommendations || [],

        // Agent-generated content
        restorationProtocol: parsed.restorationProtocol || [],
        scopeOfWork: parsed.scopeOfWork,
        itemizedEstimate: parsed.itemizedEstimate,
        totalCost,
        complianceNotes: parsed.complianceNotes,
        safetyRequirements: parsed.safetyRequirements || [],
        timeline: parsed.timeline || {},
        authorityToProceed: parsed.authorityToProceed,

        metadata: {
          clientName: request.clientName,
          insuranceCompany: request.insuranceCompany,
          claimNumber: request.claimNumber,
          assessorName: request.assessorName,
          generatedBy: 'RestoreAssist AI Agent',
          model: 'claude-opus-4-20250514',
          agentVersion: '1.0.0',
          generatedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Failed to parse agent output:', error);
      console.error('Raw agent result:', agentResult);
      throw new Error('Failed to generate valid report from agent');
    }
  }
}

// Export singleton instance
export const reportAgentService = new ReportAgentService();
