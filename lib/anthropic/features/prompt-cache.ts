/**
 * Anthropic Prompt Caching Utility
 *
 * Implements prompt caching for Anthropic Claude API to reduce costs by 90% on cache hits.
 * Supports multiple cache strategies with configurable TTLs.
 *
 * Features:
 * - Standard caching (5-minute TTL)
 * - Long-running context caching (1-hour TTL)
 * - Session-based caching (30-minute TTL)
 * - Cache control helpers
 * - Performance metrics tracking
 *
 * Documentation: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */

import Anthropic from '@anthropic-ai/sdk'

/**
 * Cache strategy determines TTL and use case
 */
export type CacheStrategy = 'standard' | 'long-running' | 'session' | 'none'

/**
 * Cache metrics for monitoring and optimization
 */
export interface CacheMetrics {
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  inputTokens?: number
  outputTokens?: number
  cacheHitRate?: number
}

/**
 * Get cache TTL in seconds based on strategy
 */
export function getCacheTTL(strategy: CacheStrategy): number | null {
  const ttls: Record<CacheStrategy, number | null> = {
    'standard': 300,      // 5 minutes - default for most agents
    'long-running': 3600, // 1 hour - for complex contexts
    'session': 1800,      // 30 minutes - for user sessions
    'none': null          // No caching
  }
  return ttls[strategy]
}

/**
 * Create a cached system prompt block
 */
export function createCachedSystemPrompt(
  content: string,
  enableCache: boolean = true
): Anthropic.Messages.TextBlockParam {
  const block: Anthropic.Messages.TextBlockParam = {
    type: 'text',
    text: content
  }

  if (enableCache) {
    block.cache_control = { type: 'ephemeral' }
  }

  return block
}

/**
 * Create multiple cached system prompt blocks
 * Useful for agents with multi-part system prompts
 */
export function createCachedSystemPrompts(
  prompts: Array<{ content: string; cached?: boolean }>,
  defaultCache: boolean = true
): Anthropic.Messages.TextBlockParam[] {
  return prompts.map(({ content, cached = defaultCache }) =>
    createCachedSystemPrompt(content, cached)
  )
}

/**
 * Wrap system string into cached block array
 */
export function wrapSystemPromptWithCache(
  system: string | Anthropic.Messages.TextBlockParam | Anthropic.Messages.TextBlockParam[],
  enableCache: boolean = true
): Anthropic.Messages.TextBlockParam[] {
  // Already an array of blocks
  if (Array.isArray(system)) {
    return system
  }

  // Already a text block
  if (typeof system === 'object' && 'type' in system) {
    if (enableCache && !system.cache_control) {
      return [{
        ...system,
        cache_control: { type: 'ephemeral' }
      }]
    }
    return [system]
  }

  // Plain string - wrap with cache
  return [createCachedSystemPrompt(system, enableCache)]
}

/**
 * Extract cache metrics from API response
 */
export function extractCacheMetrics(
  response: Anthropic.Messages.Message
): CacheMetrics {
  const usage = response.usage

  const metrics: CacheMetrics = {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens
  }

  // Cache creation tokens (first time prompt is cached)
  if ('cache_creation_input_tokens' in usage) {
    metrics.cacheCreationInputTokens = (usage as any).cache_creation_input_tokens
  }

  // Cache read tokens (cache hit)
  if ('cache_read_input_tokens' in usage) {
    metrics.cacheReadInputTokens = (usage as any).cache_read_input_tokens
  }

  // Calculate cache hit rate
  if (metrics.cacheReadInputTokens && metrics.inputTokens) {
    metrics.cacheHitRate = metrics.cacheReadInputTokens / metrics.inputTokens
  }

  return metrics
}

/**
 * Log cache metrics for monitoring
 */
export function logCacheMetrics(
  agentName: string,
  metrics: CacheMetrics,
  requestId?: string
) {
  const logData: any = {
    agent: agentName,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens
  }

  if (requestId) {
    logData.requestId = requestId
  }

  if (metrics.cacheCreationInputTokens) {
    logData.cacheCreation = metrics.cacheCreationInputTokens
    console.log(`[Cache] ${agentName}: Created cache (${metrics.cacheCreationInputTokens} tokens)`)
  }

  if (metrics.cacheReadInputTokens) {
    logData.cacheRead = metrics.cacheReadInputTokens
    logData.cacheHitRate = `${(metrics.cacheHitRate! * 100).toFixed(1)}%`
    console.log(`[Cache] ${agentName}: Cache HIT (${metrics.cacheReadInputTokens} tokens, ${logData.cacheHitRate} hit rate)`)
  }

  if (!metrics.cacheCreationInputTokens && !metrics.cacheReadInputTokens) {
    console.log(`[Cache] ${agentName}: Cache MISS (no cache used)`)
  }

  return logData
}

/**
 * Calculate cost savings from caching
 * Based on Anthropic pricing: cache writes are full price, cache reads are 90% cheaper
 */
export function calculateCacheSavings(
  metrics: CacheMetrics,
  modelPricing: { input: number; output: number } = { input: 3.0, output: 15.0 } // Per million tokens (Sonnet 4.5)
): {
  withoutCache: number
  withCache: number
  saved: number
  savingsPercent: number
} {
  const inputTokens = metrics.inputTokens || 0
  const outputTokens = metrics.outputTokens || 0
  const cacheReadTokens = metrics.cacheReadInputTokens || 0

  // Cost without caching
  const withoutCache = (
    (inputTokens / 1_000_000) * modelPricing.input +
    (outputTokens / 1_000_000) * modelPricing.output
  )

  // Cost with caching (cache reads are 10% of normal price)
  const normalInputTokens = inputTokens - cacheReadTokens
  const withCache = (
    (normalInputTokens / 1_000_000) * modelPricing.input +
    (cacheReadTokens / 1_000_000) * (modelPricing.input * 0.1) + // 90% discount
    (outputTokens / 1_000_000) * modelPricing.output
  )

  const saved = withoutCache - withCache
  const savingsPercent = withoutCache > 0 ? (saved / withoutCache) * 100 : 0

  return {
    withoutCache,
    withCache,
    saved,
    savingsPercent
  }
}

/**
 * Helper to create cached message parameters
 */
export interface CachedMessageParams {
  model: string
  maxTokens: number
  system: string | Anthropic.Messages.TextBlockParam[]
  messages: Anthropic.Messages.MessageParam[]
  temperature?: number
  topP?: number
  topK?: number
  cacheStrategy?: CacheStrategy
  enableCache?: boolean
}

/**
 * Prepare message parameters with caching
 */
export function prepareCachedMessageParams(
  params: CachedMessageParams
): Anthropic.Messages.MessageCreateParams {
  const enableCache = params.enableCache !== false && params.cacheStrategy !== 'none'

  const messageParams: Anthropic.Messages.MessageCreateParams = {
    model: params.model,
    max_tokens: params.maxTokens,
    system: wrapSystemPromptWithCache(params.system, enableCache),
    messages: params.messages
  }

  if (params.temperature !== undefined) {
    messageParams.temperature = params.temperature
  }

  if (params.topP !== undefined) {
    messageParams.top_p = params.topP
  }

  if (params.topK !== undefined) {
    messageParams.top_k = params.topK
  }

  return messageParams
}

/**
 * Best practices and strategy recommendations
 */
export const CACHE_STRATEGIES = {
  // High-frequency agents with stable prompts
  highFrequency: {
    strategy: 'standard' as CacheStrategy,
    description: 'Email agents, chat agents, frequent API calls',
    ttl: 300
  },

  // Long-running analysis with complex context
  longRunning: {
    strategy: 'long-running' as CacheStrategy,
    description: 'Report generation, gap analysis, complex reasoning',
    ttl: 3600
  },

  // User session-based interactions
  sessionBased: {
    strategy: 'session' as CacheStrategy,
    description: 'Interview agents, interactive workflows',
    ttl: 1800
  },

  // Real-time dynamic prompts (no cache benefit)
  dynamic: {
    strategy: 'none' as CacheStrategy,
    description: 'Highly variable prompts, one-time calls',
    ttl: null
  }
}

/**
 * Example usage:
 *
 * ```typescript
 * import { createCachedSystemPrompt, extractCacheMetrics, logCacheMetrics } from '@/lib/anthropic/features/prompt-cache'
 *
 * const response = await anthropic.messages.create({
 *   model: 'claude-sonnet-4-5-20250929',
 *   max_tokens: 4000,
 *   system: [
 *     createCachedSystemPrompt('You are an email intelligence agent...')
 *   ],
 *   messages: [...]
 * })
 *
 * const metrics = extractCacheMetrics(response)
 * logCacheMetrics('EmailAgent', metrics)
 * ```
 */
