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
      console.log(`✓ Successfully used model: ${modelConfig.name}`)
      return response
    } catch (error: any) {
      lastError = error
      const errorType = error.error?.type || error.status
      
      // If it's a 404/not_found, try next model
      if (error.status === 404 || errorType === 'not_found_error') {
        console.log(`✗ Model ${modelConfig.name} not found (404), trying next...`)
        continue
      }
      
      // If it's a deprecation warning but still works, log and continue
      if (error.message?.includes('deprecated')) {
        console.log(`⚠ Model ${modelConfig.name} is deprecated, trying next...`)
        continue
      }
      
      // For other errors, still try next model
      console.log(`✗ Model ${modelConfig.name} failed: ${error.message || 'Unknown error'}, trying next...`)
      continue
    }
  }

  // All models failed
  throw new Error(
    `All Claude models failed. Last error: ${lastError?.message || lastError?.error?.message || 'Unknown error'}`
  )
}

