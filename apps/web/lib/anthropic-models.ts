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
 * Get list of Claude models to try, ordered by preference
 * We try the latest models first, then fall back to stable versions
 */
export function getClaudeModels(maxTokens: number = 8000): ModelConfig[] {
  return [
    // Latest Claude 4.5 models (2025)
    { name: 'claude-sonnet-4-5-20250929', maxTokens }, // Latest Sonnet 4.5
    { name: 'claude-opus-4-5-20251101', maxTokens }, // Latest Opus 4.5

    // Stable Claude 3.x fallbacks
    { name: 'claude-3-5-sonnet-20241022', maxTokens }, // Claude 3.5 Sonnet
    { name: 'claude-3-sonnet-20240229', maxTokens }, // Stable 3.0 Sonnet
    { name: 'claude-3-opus-20240229', maxTokens: Math.min(maxTokens, 4096) }, // Stable 3.0 Opus
    { name: 'claude-3-haiku-20240307', maxTokens }, // Fast, highly available
  ]
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

