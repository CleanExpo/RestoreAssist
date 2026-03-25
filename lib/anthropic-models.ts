/**
 * Anthropic Claude Model Selection Utility
 *
 * This utility provides a function to try multiple Claude models with fallback logic.
 * It attempts models in order until one succeeds, handling deprecated/404 errors gracefully.
 *
 * Supports prompt caching for cost optimization (90% savings on cache hits).
 */

import Anthropic from '@anthropic-ai/sdk'
import { extractCacheMetrics, logCacheMetrics } from './anthropic/features/prompt-cache'

export interface ModelConfig {
  name: string
  maxTokens: number
}

/**
 * RestoreAssist premium model IDs — locked, do not change without product approval.
 * Users bring their own Anthropic API key (BYOK); these are the only two supported tiers.
 */
export const CLAUDE_MODELS = {
  OPUS: 'claude-opus-4-6',    // Premium — complex reasoning, full NIR generation
  SONNET: 'claude-sonnet-4-6' // Standard — fast tasks, classifications, summaries
} as const

/**
 * Task complexity tier.
 * - 'standard': Structured extraction, summaries, classifications → Sonnet 4.6
 * - 'premium':  Adversarial reasoning, 8K+ token output, PDF document analysis → Opus 4.6
 */
export type TaskComplexity = 'standard' | 'premium'

/**
 * Select the correct Claude model for a given task complexity.
 * Use this everywhere instead of hardcoding model strings.
 *
 * Standard → Sonnet 4.6  (fast, cost-effective — use by default)
 * Premium  → Opus 4.6    (deep reasoning — only when genuinely needed)
 *
 * Premium is required when ANY of the following apply:
 *  - Analysing PDF/document content adversarially (claim analysis)
 *  - Generating output > 6 000 tokens (full NIR reports, revolutionary gap analysis)
 *  - Legal or compliance interpretation requiring multi-step reasoning
 */
export function selectClaudeModel(complexity: TaskComplexity): string {
  return complexity === 'premium' ? CLAUDE_MODELS.OPUS : CLAUDE_MODELS.SONNET
}

/**
 * Get a single-model list for tryClaudeModels, routed by complexity.
 * No fallback chain — BYOK keys must have access to the requested tier.
 */
export function getClaudeModels(complexity: TaskComplexity = 'standard', maxTokens: number = 8000): ModelConfig[] {
  return [{ name: selectClaudeModel(complexity), maxTokens }]
}

/**
 * Try multiple Claude models until one succeeds
 * @param anthropicClient - Initialized Anthropic client
 * @param requestConfig - Request configuration (system, messages, max_tokens)
 * @param models - Optional list of models to try (defaults to getClaudeModels())
 * @param options - Optional configuration (agentName for metrics, enableCacheMetrics)
 * @returns The successful response
 * @throws Error if all models fail
 */
export async function tryClaudeModels(
  anthropicClient: any,
  requestConfig: {
    system?: string | Anthropic.Messages.TextBlockParam[]
    messages: any[]
    max_tokens?: number
    temperature?: number
    top_p?: number
    top_k?: number
  },
  models?: ModelConfig[],
  options?: {
    agentName?: string
    enableCacheMetrics?: boolean
  }
): Promise<any> {
  const modelsToTry = models || getClaudeModels(requestConfig.max_tokens || 8000)
  let lastError: any = null

  for (const modelConfig of modelsToTry) {
    try {
      const createParams: Anthropic.Messages.MessageCreateParams = {
        model: modelConfig.name,
        max_tokens: modelConfig.maxTokens,
        system: requestConfig.system,
        messages: requestConfig.messages,
      }

      // Add optional parameters
      if (requestConfig.temperature !== undefined) {
        createParams.temperature = requestConfig.temperature
      }
      if (requestConfig.top_p !== undefined) {
        createParams.top_p = requestConfig.top_p
      }
      if (requestConfig.top_k !== undefined) {
        createParams.top_k = requestConfig.top_k
      }

      const response = await anthropicClient.messages.create(createParams)

      // Log cache metrics if enabled
      if (options?.enableCacheMetrics && options?.agentName) {
        const metrics = extractCacheMetrics(response)
        logCacheMetrics(options.agentName, metrics, response.id)
      }

      return response
    } catch (error: any) {
      lastError = error
      const errorType = error.error?.type || error.status
      const errorMessage = error.error?.message || error.message || ''
      
      // If it's a 404/not_found, try next model
      if (error.status === 404 || errorType === 'not_found_error') {
        continue
      }
      
      // If it's a deprecation warning but still works, log and continue
      if (error.message?.includes('deprecated')) {
        continue
      }
      
      // If it's an API usage limit error, throw immediately with clear message
      if (errorType === 'invalid_request_error' && 
          (errorMessage.includes('API usage limits') || 
           errorMessage.includes('usage limits') ||
           errorMessage.includes('rate limit'))) {
        throw new Error(`API Usage Limit Reached: ${errorMessage}. Please check your Anthropic API account limits or try again later.`)
      }
      
      // If it's a credit balance error, throw immediately with clear message
      if (errorType === 'invalid_request_error' && 
          (errorMessage.includes('credit balance') || 
           errorMessage.includes('too low') ||
           errorMessage.includes('upgrade or purchase credits'))) {
        throw new Error(`Insufficient API Credits: ${errorMessage}. Please go to Plans & Billing in your Anthropic account to upgrade or purchase credits.`)
      }
      
      // If it's a rate limit error (429), throw with clear message
      if (error.status === 429 || errorType === 'rate_limit_error') {
        throw new Error(`Rate limit exceeded. Please wait a moment and try again.`)
      }
      
      // For other errors, still try next model
      continue
    }
  }

  // All models failed - format error message better
  const lastErrorMessage = lastError?.error?.message || lastError?.message || 'Unknown error'
  const lastErrorType = lastError?.error?.type || lastError?.status || 'unknown'
  
  // If we have a structured error, include it
  if (lastError?.error) {
    throw new Error(
      `All Claude models failed. Last error: ${lastErrorType} - ${lastErrorMessage}`
    )
  }
  
  throw new Error(
    `All Claude models failed. Last error: ${lastErrorMessage}`
  )
}

