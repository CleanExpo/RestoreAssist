/**
 * Report Analysis Agent — analyzes technician field reports to extract
 * structured data about affected areas, water source, materials, and hazards.
 *
 * This is an AI-powered agent that uses Anthropic Claude.
 */

import type { AgentConfig, AgentHandler, TaskInput, TaskOutput } from '../types'
import { callAI } from '../ai-bridge'
import { registerAgent } from '../registry'

export const reportAnalysisConfig: AgentConfig = {
  slug: 'report-analysis',
  name: 'Report Analysis Agent',
  description: 'Analyzes technician field reports to extract structured data about affected areas, water source, materials, equipment, and hazards.',
  version: '1.0.0',
  capabilities: [
    {
      name: 'analyze_technician_report',
      description: 'Extracts structured information from technician field reports',
      inputFields: ['reportId', 'technicianNotes', 'propertyAddress'],
      outputFields: ['affectedAreas', 'waterSource', 'waterCategory', 'affectedMaterials', 'equipmentDeployed', 'hazardsIdentified', 'observations'],
    },
  ],
  inputSchema: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: 'string' },
      reportId: { type: 'string' },
      technicianNotes: { type: 'string' },
      propertyAddress: { type: 'string' },
      propertyPostcode: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      affectedAreas: { type: 'array', items: { type: 'string' } },
      waterSource: { type: 'string' },
      waterCategory: { type: 'string' },
      affectedMaterials: { type: 'array', items: { type: 'string' } },
      equipmentDeployed: { type: 'array', items: { type: 'string' } },
      hazardsIdentified: { type: 'array', items: { type: 'string' } },
      moistureReadings: { type: 'array' },
      observations: { type: 'string' },
    },
  },
  defaultProvider: 'anthropic',
  defaultModel: undefined,
  maxTokens: 4000,
  temperature: 0.3,
  timeoutMs: 60000,
  maxRetries: 3,
  dependsOn: [],
}

const SYSTEM_PROMPT = `You are a restoration industry expert specializing in water damage, mold, and fire damage assessment. Analyze the technician's field report and extract structured information.

Return a JSON object with these fields:
- affectedAreas: array of room/zone names that are affected
- waterSource: description of the water source
- waterCategory: IICRC S500 category (1=Clean, 2=Grey, 3=Black, 4=Specialty)
- affectedMaterials: array of materials that were affected
- equipmentDeployed: array of equipment mentioned as deployed
- hazardsIdentified: array of safety hazards noted
- moistureReadings: array of {location, reading, unit} objects if any mentioned
- observations: summary of key observations

Return ONLY valid JSON, no markdown.`

export const reportAnalysisHandler: AgentHandler = async (input: TaskInput): Promise<TaskOutput> => {
  const { userId, data } = input
  const technicianNotes = (data.technicianNotes as string) || ''
  const propertyAddress = (data.propertyAddress as string) || 'Unknown'

  if (!technicianNotes) {
    return {
      success: false,
      data: {},
      metadata: { provider: 'none', model: 'none', tokensUsed: 0, durationMs: 0 },
      errors: [{ code: 'VALIDATION_ERROR', message: 'No technician notes provided', recoverable: false }],
    }
  }

  const userPrompt = `Analyze the following technician field report for property at ${propertyAddress}:\n\n${technicianNotes}`

  const result = await callAI({
    userId,
    agentSlug: 'report-analysis',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    overrides: { maxTokens: 4000, temperature: 0.3 },
  })

  let parsedData: Record<string, unknown>
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = result.text.match(/\{[\s\S]*\}/)
    parsedData = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
  } catch {
    parsedData = { rawResponse: result.text }
  }

  return {
    success: true,
    data: parsedData,
    metadata: {
      provider: result.provider,
      model: result.model,
      tokensUsed: result.tokensUsed,
      durationMs: 0, // Set by executor
      cost: result.cost,
    },
  }
}

// Auto-register on import
registerAgent(reportAnalysisConfig, reportAnalysisHandler)
