/**
 * Anthropic Claude Model Selection Utility
 * 
 * This utility provides a function to try multiple Claude models with fallback logic.
 * It attempts models in order until one succeeds, handling deprecated/404 errors gracefully.
 */

export interface ModelConfig {
  name: string
  maxTokens: number
}

/**
 * Get list of Claude models to try, ordered by preference
 * We try stable known-working models first, then newer ones
 */
export function getClaudeModels(maxTokens: number = 8000): ModelConfig[] {
  return [
    // Start with stable, known-working models
    { name: 'claude-3-sonnet-20240229', maxTokens }, // Stable 3.0 Sonnet
    { name: 'claude-3-opus-20240229', maxTokens: Math.min(maxTokens, 4096) }, // Stable 3.0 Opus (4096 max)
    // Then try newer 3.5 models (may be deprecated but worth trying)
    { name: 'claude-3-5-sonnet-20241022', maxTokens },
    { name: 'claude-3-5-sonnet-20240620', maxTokens },
    // Try newer date patterns (these may not exist)
    { name: 'claude-3-5-sonnet-20250205', maxTokens },
    { name: 'claude-3-5-sonnet-20250115', maxTokens },
    { name: 'claude-3-5-sonnet-20241219', maxTokens },
    // Generic model name (if API supports latest without date)
    { name: 'claude-3-5-sonnet', maxTokens },
  ]
}

/**
 * Try multiple Claude models until one succeeds
 * @param anthropicClient - Initialized Anthropic client
 * @param requestConfig - Request configuration (system, messages, max_tokens)
 * @param models - Optional list of models to try (defaults to getClaudeModels())
 * @returns The successful response
 * @throws Error if all models fail
 */
export async function tryClaudeModels(
  anthropicClient: any,
  requestConfig: {
    system?: string
    messages: any[]
    max_tokens?: number
  },
  models?: ModelConfig[]
): Promise<any> {
  const modelsToTry = models || getClaudeModels(requestConfig.max_tokens || 8000)
  let lastError: any = null

  for (const modelConfig of modelsToTry) {
    try {
      const response = await anthropicClient.messages.create({
        model: modelConfig.name,
        max_tokens: modelConfig.maxTokens,
        system: requestConfig.system,
        messages: requestConfig.messages,
      })
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

