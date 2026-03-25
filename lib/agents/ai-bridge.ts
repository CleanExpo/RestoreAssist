/**
 * AI Bridge — connects the agent framework to the existing AI provider
 * infrastructure (lib/ai-provider.ts, lib/anthropic-models.ts).
 *
 * Wraps existing functions without modifying them.
 */

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropicApiKey } from '@/lib/ai-provider'
import { tryClaudeModels, getClaudeModels, CLAUDE_MODELS, type TaskComplexity } from '@/lib/anthropic-models'
import { createCachedSystemPrompt } from '@/lib/anthropic/features/prompt-cache'
import type { AgentSlug, AIProviderType } from './types'

export interface AIBridgeParams {
  userId: string
  agentSlug: AgentSlug
  systemPrompt: string
  userPrompt: string
  overrides?: {
    provider?: AIProviderType
    model?: string
    maxTokens?: number
    temperature?: number
    complexity?: TaskComplexity
  }
}

export interface AIBridgeResult {
  text: string
  tokensUsed: number
  provider: string
  model: string
  cost: number
}

/**
 * Call an AI provider with agent-specific configuration.
 * Currently supports Anthropic (primary) via the existing tryClaudeModels pattern.
 */
export async function callAI(params: AIBridgeParams): Promise<AIBridgeResult> {
  const { userId, systemPrompt, userPrompt, overrides } = params
  const provider = overrides?.provider ?? 'anthropic'
  const maxTokens = overrides?.maxTokens ?? 8000
  const complexity: TaskComplexity = overrides?.complexity ?? 'standard'

  if (provider === 'local') {
    throw new Error('Local agents do not use the AI bridge')
  }

  const apiKey = await getAnthropicApiKey(userId)
  const client = new Anthropic({ apiKey })

  // Explicit model override takes priority; otherwise route by complexity
  const models = overrides?.model
    ? [{ name: overrides.model, maxTokens }]
    : getClaudeModels(complexity, maxTokens)

  const response = await tryClaudeModels(client, {
    system: [createCachedSystemPrompt(systemPrompt)],
    messages: [{ role: 'user', content: userPrompt }],
    max_tokens: maxTokens,
  }, models, {
    agentName: `Agent-${params.agentSlug}`,
    enableCacheMetrics: true
  })

  const text =
    response.content?.[0]?.type === 'text'
      ? (response.content[0] as { type: 'text'; text: string }).text
      : ''

  const inputTokens = response.usage?.input_tokens ?? 0
  const outputTokens = response.usage?.output_tokens ?? 0
  const totalTokens = inputTokens + outputTokens

  // Rough cost estimate (Sonnet 4.6 pricing; Opus 4.6 is ~5× higher)
  const isOpus = models[0]?.name === CLAUDE_MODELS.OPUS
  const cost = isOpus
    ? (inputTokens * 0.015 + outputTokens * 0.075) / 1000
    : (inputTokens * 0.003 + outputTokens * 0.015) / 1000

  return {
    text,
    tokensUsed: totalTokens,
    provider: 'anthropic',
    model: response.model ?? models[0].name,
    cost,
  }
}
