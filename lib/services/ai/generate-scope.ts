/**
 * Streaming scope-narrative generator.
 *
 * Thin wrapper over callAnthropicStream that pins the request shape used by
 * app/api/inspections/[id]/generate-scope/route.ts:
 *  - Model: caller-provided (Sonnet by default, Opus opt-in)
 *  - max_tokens: 2000
 *  - System prompt with cache_control: ephemeral (Anthropic prompt caching)
 *  - User message: caller-constructed JSON-payload string
 *
 * Claim-type prompt selection + RAG retrieval STAY IN THE ROUTE — they are
 * stateful pre-flight concerns, not service mechanics.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import type { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream";
import { callAnthropicStream } from "./anthropic-gateway";
import type { AnthropicReason } from "./anthropic-gateway";
import type { ServiceResult } from "@/lib/services/_shared/result";

export type GenerateScopeStreamArgs = {
  userId: string;
  systemPrompt: string;
  userMessage: string;
  model: string;
};

export async function generateScopeStream(
  args: GenerateScopeStreamArgs,
): Promise<ServiceResult<MessageStream, AnthropicReason>> {
  return callAnthropicStream({
    userId: args.userId,
    request: {
      model: args.model,
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: args.systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: args.userMessage }],
    },
  });
}
