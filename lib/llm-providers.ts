/**
 * Multi-Provider LLM System
 * Supports: Anthropic Claude, OpenAI GPT, Google Gemini
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

export type LLMProvider = 'anthropic' | 'openai' | 'google'

export interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  model?: string
}

export interface LLMResponse {
  content: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

/**
 * Unified LLM Client
 * Abstracts away provider-specific implementations
 */
export class UnifiedLLMClient {
  private provider: LLMProvider
  private apiKey: string
  private model: string

  constructor(config: LLMConfig) {
    this.provider = config.provider
    this.apiKey = config.apiKey
    this.model = config.model || this.getDefaultModel(config.provider)
  }

  private getDefaultModel(provider: LLMProvider): string {
    switch (provider) {
      case 'anthropic':
        return 'claude-3-5-sonnet-20241022'
      case 'openai':
        return 'gpt-4-turbo-preview'
      case 'google':
        return 'gemini-1.5-pro'
      default:
        throw new Error(`Unknown provider: ${provider}`)
    }
  }

  /**
   * Generate text completion
   */
  async generateCompletion(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    switch (this.provider) {
      case 'anthropic':
        return this.generateAnthropic(prompt, systemPrompt)
      case 'openai':
        return this.generateOpenAI(prompt, systemPrompt)
      case 'google':
        return this.generateGoogle(prompt, systemPrompt)
      default:
        throw new Error(`Unsupported provider: ${this.provider}`)
    }
  }

  private async generateAnthropic(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    const anthropic = new Anthropic({ apiKey: this.apiKey })

    const response = await anthropic.messages.create({
      model: this.model,
      max_tokens: 8000,
      temperature: 0.4,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    })

    if (response.content[0].type === 'text') {
      return {
        content: response.content[0].text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      }
    }

    throw new Error('Unexpected response format from Anthropic')
  }

  private async generateOpenAI(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    const openai = new OpenAI({ apiKey: this.apiKey })

    const messages: any[] = []
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    const response = await openai.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.4,
      max_tokens: 8000,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No content in OpenAI response')
    }

    return {
      content,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
      },
    }
  }

  private async generateGoogle(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    const genAI = new GoogleGenerativeAI(this.apiKey)
    const model = genAI.getGenerativeModel({ model: this.model })

    // Combine system prompt and user prompt
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt

    const result = await model.generateContent(fullPrompt)
    const response = result.response
    const content = response.text()

    return {
      content,
      usage: {
        // Google doesn't provide detailed token usage in the same way
        totalTokens: response.usageMetadata?.totalTokenCount,
      },
    }
  }
}

/**
 * Create LLM client from user's API key settings
 */
export function createLLMClient(provider: LLMProvider, apiKey: string, model?: string): UnifiedLLMClient {
  return new UnifiedLLMClient({ provider, apiKey, model })
}

/**
 * Validate API key for a provider
 */
export async function validateAPIKey(provider: LLMProvider, apiKey: string): Promise<boolean> {
  try {
    const client = createLLMClient(provider, apiKey)
    await client.generateCompletion('Hello', 'Respond with just "OK"')
    return true
  } catch (error) {
    console.error(`API key validation failed for ${provider}:`, error)
    return false
  }
}

/**
 * Get available providers
 */
export function getAvailableProviders(): Array<{ value: LLMProvider; label: string; description: string }> {
  return [
    {
      value: 'anthropic',
      label: 'Anthropic Claude',
      description: 'Claude 3.5 Sonnet - Excellent reasoning and long context',
    },
    {
      value: 'openai',
      label: 'OpenAI GPT',
      description: 'GPT-4 Turbo - Powerful and fast general-purpose model',
    },
    {
      value: 'google',
      label: 'Google Gemini',
      description: 'Gemini 1.5 Pro - Multimodal with massive context window',
    },
  ]
}

/**
 * Get models for a provider
 */
export function getModelsForProvider(provider: LLMProvider): Array<{ value: string; label: string }> {
  switch (provider) {
    case 'anthropic':
      return [
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Latest)' },
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
        { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
        { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
      ]
    case 'openai':
      return [
        { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo' },
        { value: 'gpt-4', label: 'GPT-4' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
      ]
    case 'google':
      return [
        { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
        { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
        { value: 'gemini-pro', label: 'Gemini Pro' },
      ]
    default:
      return []
  }
}
