// RA-8001 [AC8] audit fixture, never served: scanned with this fixture
// directory as rootDir. Resolves a key and builds a client with no check of
// the key's source, so a funded trial would spend the platform key.
import Anthropic from "@anthropic-ai/sdk";
import { resolveWorkspaceAiKey } from "@/lib/ai/resolve-workspace-ai-key";

export async function POST(request: Request) {
  const { userId } = (await request.json()) as { userId: string };
  const { apiKey } = await resolveWorkspaceAiKey(userId, "ANTHROPIC");
  const client = new Anthropic({ apiKey });
  const reply = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 100,
    messages: [{ role: "user", content: "Summarise this report draft" }],
  });
  return Response.json(reply);
}
