/**
 * Scope Generation Agent — creates scope of works based on classification,
 * building codes, and affected areas. This is a LOCAL agent (no AI call).
 *
 * Wraps lib/nir-scope-determination.ts determineScopeItems()
 */

import type { AgentConfig, AgentHandler, TaskInput, TaskOutput } from '../types'
import { determineScopeItems } from '@/lib/nir-scope-determination'
import { registerAgent } from '../registry'

export const scopeGenerationConfig: AgentConfig = {
  slug: 'scope-generation',
  name: 'Scope Generation Agent',
  description: 'Generates a scope of works based on IICRC classification, affected areas, and building code requirements.',
  version: '1.0.0',
  capabilities: [
    {
      name: 'generate_scope',
      description: 'Creates a list of required scope items for the restoration project',
      inputFields: ['category', 'class', 'waterSource', 'affectedAreas'],
      outputFields: ['scopeItems', 'totalItems', 'requiredItems', 'optionalItems'],
    },
  ],
  inputSchema: {
    type: 'object',
    required: ['category', 'class', 'waterSource', 'affectedAreas'],
    properties: {
      category: { type: 'string' },
      class: { type: 'string' },
      waterSource: { type: 'string' },
      affectedAreas: { type: 'array' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      scopeItems: { type: 'array' },
      totalItems: { type: 'number' },
      requiredItems: { type: 'number' },
      optionalItems: { type: 'number' },
    },
  },
  defaultProvider: 'local',
  maxTokens: 0,
  temperature: 0,
  timeoutMs: 10000,
  maxRetries: 1,
  dependsOn: ['classification'],
}

export const scopeGenerationHandler: AgentHandler = async (input: TaskInput): Promise<TaskOutput> => {
  const { data, context } = input
  const startTime = Date.now()

  // Pull classification output from workflow context
  const classificationOutput = context?.['classification'] as any
  const reportAnalysisOutput = context?.['report-analysis'] as any

  const category = (data.category as string) || classificationOutput?.data?.category || '1'
  const waterClass = (data.class as string) || classificationOutput?.data?.class || '2'
  const waterSource = (data.waterSource as string) || reportAnalysisOutput?.data?.waterSource || 'Unknown'

  const affectedAreas = (data.affectedAreas as any[]) || [
    {
      roomZoneId: 'default',
      affectedSquareFootage: 100,
      surfaceType: 'Drywall',
      moistureLevel: 50,
    },
  ]

  const scopeItems = determineScopeItems({
    category,
    class: waterClass,
    waterSource,
    affectedAreas,
  })

  const requiredItems = scopeItems.filter((item) => item.isRequired).length
  const optionalItems = scopeItems.length - requiredItems

  return {
    success: true,
    data: {
      scopeItems,
      totalItems: scopeItems.length,
      requiredItems,
      optionalItems,
    },
    metadata: {
      provider: 'local',
      model: 'nir-scope-determination',
      tokensUsed: 0,
      durationMs: Date.now() - startTime,
    },
  }
}

// Auto-register on import
registerAgent(scopeGenerationConfig, scopeGenerationHandler)
