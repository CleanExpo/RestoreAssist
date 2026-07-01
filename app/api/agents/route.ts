import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAllAgents, syncToDatabase } from "@/lib/agents";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * GET /api/agents — List all registered agents
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // Ensure agents are registered
    await syncToDatabase();

    const agents = getAllAgents().map((agent) => ({
      slug: agent.slug,
      name: agent.name,
      description: agent.description,
      version: agent.version,
      capabilities: agent.capabilities,
      defaultProvider: agent.defaultProvider,
      dependsOn: agent.dependsOn,
    }));

    return NextResponse.json({ agents, count: agents.length });
  } catch (error) {
    return fromException(request, error, { stage: "agents-list" });
  }
}
