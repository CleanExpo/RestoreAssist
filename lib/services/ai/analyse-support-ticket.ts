/**
 * Inbound support ticket analyser (Claude Haiku).
 *
 * Composes lib/services/ai/anthropic-gateway.ts (platform-key flow). Single
 * call returns category + priority + responseDraft for an inbound support
 * ticket. Distinct from draft-support-ticket (admin-triggered, response-only
 * generation).
 *
 * Uses the PLATFORM key (process.env.ANTHROPIC_API_KEY) — the action layer
 * reads the env and passes it via `apiKey`; the service stays env-agnostic
 * for testability.
 *
 * The route degrades gracefully when this service fails: caller ignores
 * failures (logs them) and falls back to a user-provided category +
 * priority "normal" + no responseDraft.
 *
 * Reasons:
 *  - <AnthropicReason>  — bubbled from the gateway
 *  - PARSE_FAILED       — model output was not valid JSON
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { callAnthropic } from "./anthropic-gateway";
import type { AnthropicReason } from "./anthropic-gateway";
import { requireAiTaskPolicy } from "@/lib/ai/task-policy";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";

const SYSTEM_PROMPT = `You are a customer support specialist for RestoreAssist — Australian water damage restoration software.

Given a support ticket, respond with JSON only (no markdown, no explanation):
{
  "category": "general|billing|technical|feature_request|bug",
  "priority": "low|normal|high|urgent",
  "responseDraft": "Professional response in Australian English, 150-250 words..."
}

Category rules:
- billing: mentions payment, invoice, subscription, price, refund, charge
- technical: software errors, crashes, API issues, integration problems
- feature_request: requests for new features or improvements
- bug: reports of incorrect behaviour
- general: everything else

Priority rules:
- urgent: production outage, data loss, cannot access account
- high: major feature broken, billing error
- normal: general questions, feature requests
- low: cosmetic issues, minor suggestions

Response draft must:
- Address the specific issue raised
- Reference IICRC S500:2021 if technically relevant
- End with next-steps and timeline (we respond within 24 hours)
- Be warm but professional
- Use Australian English spelling`;

export type AnalyseSupportTicketReason = AnthropicReason | "PARSE_FAILED";

export type SupportCategory =
  | "general"
  | "billing"
  | "technical"
  | "feature_request"
  | "bug";
export type SupportPriority = "low" | "normal" | "high" | "urgent";

export interface SupportTicketAnalysis {
  category: SupportCategory;
  priority: SupportPriority;
  responseDraft: string;
}

const VALID_CATEGORIES: SupportCategory[] = [
  "general",
  "billing",
  "technical",
  "feature_request",
  "bug",
];
const VALID_PRIORITIES: SupportPriority[] = ["low", "normal", "high", "urgent"];

export async function analyseSupportTicket(args: {
  apiKey: string;
  ticket: { subject: string; body: string };
}): Promise<ServiceResult<SupportTicketAnalysis, AnalyseSupportTicketReason>> {
  const policy = requireAiTaskPolicy("support_ticket_analysis");

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
          content: `Subject: ${args.ticket.subject}\n\n${args.ticket.body}`,
        },
      ],
    },
  });

  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  const textBlock = gatewayResult.data.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";

  const cleaned = raw
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  let parsed: Partial<SupportTicketAnalysis>;
  try {
    parsed = JSON.parse(cleaned) as Partial<SupportTicketAnalysis>;
  } catch (err) {
    return fail("PARSE_FAILED", {
      detail: `Model output was not valid JSON: ${raw.slice(0, 200)}`,
      cause: err,
    });
  }

  const category =
    parsed.category && VALID_CATEGORIES.includes(parsed.category)
      ? parsed.category
      : "general";
  const priority =
    parsed.priority && VALID_PRIORITIES.includes(parsed.priority)
      ? parsed.priority
      : "normal";
  const responseDraft =
    typeof parsed.responseDraft === "string" && parsed.responseDraft.length > 0
      ? parsed.responseDraft
      : "";

  return ok({ category, priority, responseDraft });
}
