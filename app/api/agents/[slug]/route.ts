import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAgent, syncToDatabase } from "@/lib/agents";
import type { AgentSlug } from "@/lib/agents";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * GET /api/agents/[slug] — Get agent details and capabilities
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    await syncToDatabase();

    const { slug } = await params;
    const agent = getAgent(slug as AgentSlug);

    if (!agent) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Agent not found",
        status: 404,
      });
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
    });
  } catch (error) {
    return fromException(request, error, { stage: "agent-detail" });
  }
}
