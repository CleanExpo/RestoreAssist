/**
 * Agent Registry — manages agent discovery and registration.
 *
 * Agents are registered in-memory at module load time (code is the source
 * of truth). The syncToDatabase() method upserts AgentDefinition rows so
 * that the workflow and task tables can reference agents by slug.
 */

import { prisma } from '@/lib/prisma'
import type { AgentConfig, AgentHandler, AgentSlug } from './types'

// ---------------------------------------------------------------------------
// In-memory registry (re-initialised on each serverless cold start)
// ---------------------------------------------------------------------------

const agentConfigs = new Map<AgentSlug, AgentConfig>()
const agentHandlers = new Map<AgentSlug, AgentHandler>()

/**
 * Register an agent config and its handler function.
 * Called by each agent definition module at import time.
 */
export function registerAgent(config: AgentConfig, handler: AgentHandler): void {
  agentConfigs.set(config.slug, config)
  agentHandlers.set(config.slug, handler)
}

/**
 * Retrieve a registered agent config by slug.
 */
export function getAgent(slug: AgentSlug): AgentConfig | undefined {
  return agentConfigs.get(slug)
}

/**
 * Retrieve the handler function for an agent.
 */
export function getAgentHandler(slug: AgentSlug): AgentHandler | undefined {
  return agentHandlers.get(slug)
}

/**
 * List all registered agents.
 */
export function getAllAgents(): AgentConfig[] {
  return Array.from(agentConfigs.values())
}

/**
 * Find agents that have a specific capability name.
 */
export function getAgentsByCapability(capabilityName: string): AgentConfig[] {
  return getAllAgents().filter((a) =>
    a.capabilities.some((c) => c.name === capabilityName)
  )
}

/**
 * Validate that all declared dependencies of an agent are registered.
 */
export function validateDependencies(slug: AgentSlug): { valid: boolean; missing: AgentSlug[] } {
  const config = agentConfigs.get(slug)
  if (!config) return { valid: false, missing: [slug] }

  const missing = config.dependsOn.filter((dep) => !agentConfigs.has(dep))
  return { valid: missing.length === 0, missing }
}

// ---------------------------------------------------------------------------
// Database sync
// ---------------------------------------------------------------------------

let synced = false

/**
 * Upsert all in-memory agent definitions to the AgentDefinition table.
 * Safe to call multiple times; uses a simple flag to skip re-syncing
 * within the same serverless invocation.
 */
export async function syncToDatabase(): Promise<void> {
  if (synced) return
  try {
    const agents = getAllAgents()
    for (const config of agents) {
      await prisma.agentDefinition.upsert({
        where: { slug: config.slug },
        update: {
          name: config.name,
          description: config.description,
          version: config.version,
          capabilities: JSON.stringify(config.capabilities),
          inputSchema: JSON.stringify(config.inputSchema),
          outputSchema: JSON.stringify(config.outputSchema),
          defaultProvider: config.defaultProvider,
          defaultModel: config.defaultModel ?? null,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          timeoutMs: config.timeoutMs,
          maxRetries: config.maxRetries,
          dependsOn: config.dependsOn,
          isActive: true,
        },
        create: {
          slug: config.slug,
          name: config.name,
          description: config.description,
          version: config.version,
          capabilities: JSON.stringify(config.capabilities),
          inputSchema: JSON.stringify(config.inputSchema),
          outputSchema: JSON.stringify(config.outputSchema),
          defaultProvider: config.defaultProvider,
          defaultModel: config.defaultModel ?? null,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          timeoutMs: config.timeoutMs,
          maxRetries: config.maxRetries,
          dependsOn: config.dependsOn,
        },
      })
    }
    synced = true
  } catch (err) {
    console.error('[AgentRegistry] Failed to sync to database:', err)
  }
}
