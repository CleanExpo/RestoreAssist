import Anthropic from '@anthropic-ai/sdk';
import { GenerateReportRequest, GeneratedReport, ReportItem } from '../types';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

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

export class ClaudeService {
  async generateReport(request: GenerateReportRequest): Promise<GeneratedReport> {
    const prompt = this.buildPrompt(request);

    const message = await client.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 8000,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    return this.parseResponse(responseText, request);
  }

  private buildPrompt(request: GenerateReportRequest): string {
    const standards = AUSTRALIAN_STANDARDS[request.state];

    return `You are an expert disaster restoration assessor in Australia. Generate a comprehensive damage assessment report.

**Property Details:**
- Address: ${request.propertyAddress}
- State: ${request.state}
- Damage Type: ${request.damageType}
- Description: ${request.damageDescription}
${request.clientName ? `- Client: ${request.clientName}` : ''}
${request.insuranceCompany ? `- Insurer: ${request.insuranceCompany}` : ''}
${request.claimNumber ? `- Claim #: ${request.claimNumber}` : ''}

**Compliance Standards:** ${standards}

Generate a detailed report in the following JSON format:

{
  "summary": "Professional damage assessment summary (3-5 sentences)",
  "scopeOfWork": ["Step 1", "Step 2", "Step 3"...],
  "itemizedEstimate": [
    {
      "description": "Item description",
      "quantity": 1,
      "unitCost": 100.00,
      "totalCost": 100.00,
      "category": "Labor|Materials|Equipment|Disposal"
    }
  ],
  "complianceNotes": ["Compliance requirement 1", "Compliance requirement 2"],
  "authorityToProceed": "Professional ATP template text"
}

**Requirements:**
1. Use Australian dollars (AUD) with realistic market rates
2. Include all safety/compliance requirements for ${request.state}
3. Itemize labor, materials, equipment, disposal
4. Provide step-by-step scope of work
5. Generate professional Authority to Proceed text
6. Be specific and detailed

Return ONLY valid JSON, no markdown formatting.`;
  }

  private parseResponse(responseText: string, request: GenerateReportRequest): GeneratedReport {
    try {
      // Clean response text
      let cleanedText = responseText.trim();

      // Remove markdown code blocks if present
      cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      const parsed = JSON.parse(cleanedText);

      const totalCost = parsed.itemizedEstimate.reduce(
        (sum: number, item: ReportItem) => sum + item.totalCost,
        0
      );

      return {
        reportId: `RPT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        propertyAddress: request.propertyAddress,
        damageType: request.damageType,
        state: request.state,
        summary: parsed.summary,
        scopeOfWork: parsed.scopeOfWork,
        itemizedEstimate: parsed.itemizedEstimate,
        totalCost,
        complianceNotes: parsed.complianceNotes,
        authorityToProceed: parsed.authorityToProceed,
        metadata: {
          clientName: request.clientName,
          insuranceCompany: request.insuranceCompany,
          claimNumber: request.claimNumber,
          generatedBy: 'RestoreAssist AI',
          model: 'claude-opus-4-20250514'
        }
      };
    } catch (error) {
      console.error('Failed to parse Claude response:', error);
      console.error('Raw response:', responseText);
      throw new Error('Failed to generate valid report');
    }
  }
}
