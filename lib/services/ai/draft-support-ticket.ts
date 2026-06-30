/**
 * Drafts a customer-support response for an admin user via Claude Haiku.
 *
 * Uses the PLATFORM key (process.env.ANTHROPIC_API_KEY) — this is an admin
 * operation, not user-billed. The action layer (the route) reads the env
 * and passes it via `apiKey`; the service stays env-agnostic for testability.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { callAnthropic } from "./anthropic-gateway";
import type { AnthropicReason } from "./anthropic-gateway";
import { requireAiTaskPolicy } from "@/lib/ai/task-policy";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";

const SYSTEM_PROMPT = `You are a customer support specialist for RestoreAssist — Australian water damage restoration software.

Generate a professional customer support response in Australian English (150-250 words).

The response must:
- Address the specific issue raised in the ticket
- Reference IICRC S500:2021 if technically relevant
- End with next-steps and a timeline (we respond within 24 hours)
- Be warm but professional
- Use Australian English spelling

Respond with only the response text — no JSON, no preamble.`;

export type DraftReason = AnthropicReason | "EMPTY_OUTPUT";

export interface SupportTicketContext {
  category: string;
  priority: string;
  subject: string;
  body: string;
}

export async function draftSupportTicketReply(args: {
  apiKey: string;
  ticket: SupportTicketContext;
}): Promise<ServiceResult<string, DraftReason>> {
  const policy = requireAiTaskPolicy("support_response_draft");

  const gatewayResult = await callAnthropic({
    userId: "system",
    apiKey: args.apiKey,
    request: {
      model: "claude-haiku-4-5-20251001",
      max_tokens: policy.maxOutputTokens ?? 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Category: ${args.ticket.category}\nPriority: ${args.ticket.priority}\nSubject: ${args.ticket.subject}\n\n${args.ticket.body}`,
        },
      ],
    },
  });

  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  const textBlock = gatewayResult.data.content.find((b) => b.type === "text");
  const draft =
    textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

  if (!draft) {
    return fail("EMPTY_OUTPUT", {
      detail: "Model returned no text content",
    });
  }

  return ok(draft);
}
