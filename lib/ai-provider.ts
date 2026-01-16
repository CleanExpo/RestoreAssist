import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { prisma } from './prisma'
import { tryClaudeModels } from './anthropic-models'
import { getOrganizationOwner } from './organization-credits'

export type AIProvider = 'anthropic' | 'openai' | 'gemini'

export interface AIIntegration {
  id: string
  name: string
  apiKey: string
  provider: AIProvider
}

/**
 * Get the effective user ID for integrations
 * For Managers/Technicians, returns the Admin's ID
 * For Admins, returns their own ID
 */
export async function getEffectiveUserIdForIntegrations(userId: string): Promise<string> {
  const ownerId = await getOrganizationOwner(userId)
  return ownerId || userId
}

/**
 * Get integrations for a user (using Admin's integrations for Managers/Technicians)
 */
export async function getIntegrationsForUser(userId: string, filters?: {
  status?: 'CONNECTED' | 'DISCONNECTED'
  nameContains?: string[]
}): Promise<any[]> {
  const effectiveUserId = await getEffectiveUserIdForIntegrations(userId)
  
  const whereClause: any = {
    userId: effectiveUserId,
    apiKey: { not: null }
  }

  if (filters?.status) {
    whereClause.status = filters.status
  } else {
    whereClause.status = 'CONNECTED'
  }

  if (filters?.nameContains && filters.nameContains.length > 0) {
    whereClause.OR = filters.nameContains.map(name => ({
      name: { contains: name }
    }))
  }

  return await prisma.integration.findMany({
    where: whereClause,
    orderBy: {
      createdAt: 'desc'
    }
  })
}

/**
 * Get the latest connected AI integration (OpenAI, Anthropic, or Gemini)
 * For Managers/Technicians, uses the Admin's integrations
 * For Admins, uses their own integrations
 * Returns the most recently connected integration
 */
export async function getLatestAIIntegration(userId: string): Promise<AIIntegration | null> {
  const integrations = await getIntegrationsForUser(userId, {
    status: 'CONNECTED',
    nameContains: ['Anthropic', 'OpenAI', 'Gemini', 'Claude', 'GPT']
  })

  if (integrations.length === 0) {
    return null
  }

  // Get the latest integration
  const integration = integrations[0]

  // Determine provider type
  let provider: AIProvider = 'anthropic' // default
  const nameLower = integration.name.toLowerCase()
  
  if (nameLower.includes('openai') || nameLower.includes('gpt')) {
    provider = 'openai'
  } else if (nameLower.includes('gemini') || nameLower.includes('google')) {
    provider = 'gemini'
  } else if (nameLower.includes('anthropic') || nameLower.includes('claude')) {
    provider = 'anthropic'
  }

  return {
    id: integration.id,
    name: integration.name,
    apiKey: integration.apiKey!,
    provider
  }
}

/**
 * Call the appropriate AI provider based on integration type
 */
export async function callAIProvider(
  integration: AIIntegration,
  options: {
    system?: string
    prompt: string
    maxTokens?: number
    temperature?: number
  }
): Promise<string> {
  const { system, prompt, maxTokens = 16000, temperature = 0.7 } = options

  switch (integration.provider) {
    case 'anthropic': {
      const anthropic = new Anthropic({
        apiKey: integration.apiKey
      })

      const messages: any[] = [
        {
          role: 'user',
          content: prompt
        }
      ]

      // Use tryClaudeModels for automatic fallback to working models
      const response = await tryClaudeModels(
        anthropic,
        {
          system,
          messages,
          max_tokens: maxTokens
        }
      )
      
      if (response.content && response.content.length > 0 && response.content[0].type === 'text') {
        return response.content[0].text
      }
      
      throw new Error('Unexpected response format from Anthropic')
    }

    case 'openai': {
      const openai = new OpenAI({
        apiKey: integration.apiKey
      })

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
      
      if (system) {
        messages.push({
          role: 'system',
          content: system
        })
      }
      
      messages.push({
        role: 'user',
        content: prompt
      })

      // OpenAI models have different max_tokens limits
      // gpt-4-turbo-preview supports max 4096 completion tokens
      // Use a safer limit for OpenAI
      const openaiMaxTokens = Math.min(maxTokens, 4096)

      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages,
        max_tokens: openaiMaxTokens,
        temperature
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content in OpenAI response')
      }

      return content
    }

    case 'gemini': {
      const genAI = new GoogleGenerativeAI(integration.apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' })

      let fullPrompt = prompt
      if (system) {
        fullPrompt = `${system}\n\n${prompt}`
      }

      const result = await model.generateContent(fullPrompt)
      const response = await result.response
      const text = response.text()

      if (!text) {
        throw new Error('No content in Gemini response')
      }

      return text
    }

    default:
      throw new Error(`Unsupported AI provider: ${integration.provider}`)
  }
}

