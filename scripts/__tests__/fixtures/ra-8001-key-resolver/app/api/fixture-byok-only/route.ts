// RA-8001 [AC8] audit fixture, never served: the twin of ../fixture. The same
// key resolution, but the provider call runs under the byok-only key policy,
// which refuses the platform key.
import { callAI } from "@/lib/agents/ai-bridge";
import { resolveWorkspaceAiKey } from "@/lib/ai/resolve-workspace-ai-key";

export async function POST(request: Request) {
  const { userId } = (await request.json()) as { userId: string };
  await resolveWorkspaceAiKey(userId, "ANTHROPIC");
  const reply = await callAI({
    userId,
    agentSlug: "report-analysis",
    systemPrompt: "Summarise this report draft",
    userPrompt: "draft",
    keyPolicy: "byok-only",
    overrides: { maxTokens: 100 },
  });
  return Response.json(reply);
}
