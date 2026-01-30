/**
 * IICRC Classification Agent — determines water damage category and class
 * based on inspection data. This is a LOCAL agent (no AI call needed).
 *
 * Wraps lib/nir-classification-engine.ts classifyIICRC()
 */

import type { AgentConfig, AgentHandler, TaskInput, TaskOutput } from '../types'
import { classifyIICRC } from '@/lib/nir-classification-engine'
import { registerAgent } from '../registry'

export const classificationConfig: AgentConfig = {
  slug: 'classification',
  name: 'IICRC Classification Agent',
  description: 'Determines IICRC S500 water damage category (1-4) and class (1-4) based on water source, affected area, moisture readings, and environmental data.',
  version: '1.0.0',
  capabilities: [
    {
      name: 'classify_water_damage',
      description: 'Classifies water damage per IICRC S500 standards',
      inputFields: ['waterSource', 'affectedSquareFootage', 'moistureReadings', 'environmentalData'],
      outputFields: ['category', 'class', 'justification', 'standardReference', 'confidence'],
    },
  ],
  inputSchema: {
    type: 'object',
    required: ['waterSource', 'affectedSquareFootage', 'moistureReadings', 'environmentalData'],
    properties: {
      waterSource: { type: 'string' },
      affectedSquareFootage: { type: 'number' },
      moistureReadings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            surfaceType: { type: 'string' },
            moistureLevel: { type: 'number' },
            depth: { type: 'string' },
          },
        },
      },
      environmentalData: {
        type: 'object',
        properties: {
          ambientTemperature: { type: 'number' },
          humidityLevel: { type: 'number' },
          dewPoint: { type: 'number' },
        },
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      category: { type: 'string' },
      class: { type: 'string' },
      justification: { type: 'string' },
      standardReference: { type: 'string' },
      confidence: { type: 'number' },
    },
  },
  defaultProvider: 'local',
  maxTokens: 0,
  temperature: 0,
  timeoutMs: 10000,
  maxRetries: 1,
  dependsOn: ['report-analysis'],
}

export const classificationHandler: AgentHandler = async (input: TaskInput): Promise<TaskOutput> => {
  const { data, context } = input
  const startTime = Date.now()

  // Extract data from direct input or from report-analysis output
  const reportAnalysisOutput = context?.['report-analysis'] as any
  const waterSource = (data.waterSource as string) || reportAnalysisOutput?.data?.waterSource || 'Unknown'
  const affectedSquareFootage = (data.affectedSquareFootage as number) || 100

  const moistureReadings = (data.moistureReadings as any[]) ||
    reportAnalysisOutput?.data?.moistureReadings?.map((r: any) => ({
      surfaceType: r.location || 'Unknown',
      moistureLevel: r.reading || 50,
      depth: r.unit || 'surface',
    })) || [
      { surfaceType: 'Drywall', moistureLevel: 50, depth: 'surface' },
    ]

  const environmentalData = (data.environmentalData as any) || {
    ambientTemperature: 22,
    humidityLevel: 65,
    dewPoint: 15,
  }

  const result = await classifyIICRC({
    waterSource,
    affectedSquareFootage,
    moistureReadings,
    environmentalData,
    timeSinceLoss: (data.timeSinceLoss as number) ?? null,
  })

  return {
    success: true,
    data: {
      category: result.category,
      class: result.class,
      justification: result.justification,
      standardReference: result.standardReference,
      confidence: result.confidence,
    },
    metadata: {
      provider: 'local',
      model: 'nir-classification-engine',
      tokensUsed: 0,
      durationMs: Date.now() - startTime,
    },
  }
}

// Auto-register on import
registerAgent(classificationConfig, classificationHandler)
