import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAgent, syncToDatabase } from '@/lib/agents'
import type { AgentSlug } from '@/lib/agents'

/**
 * GET /api/agents/[slug] — Get agent details and capabilities
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await syncToDatabase()

    const { slug } = await params
    const agent = getAgent(slug as AgentSlug)

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({
      slug: agent.slug,
      name: agent.name,
      description: agent.description,
      version: agent.version,
      capabilities: agent.capabilities,
      inputSchema: agent.inputSchema,
      outputSchema: agent.outputSchema,
      defaultProvider: agent.defaultProvider,
      defaultModel: agent.defaultModel,
      maxTokens: agent.maxTokens,
      temperature: agent.temperature,
      timeoutMs: agent.timeoutMs,
      maxRetries: agent.maxRetries,
      dependsOn: agent.dependsOn,
    })
  } catch (error) {
    console.error('Error fetching agent:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
