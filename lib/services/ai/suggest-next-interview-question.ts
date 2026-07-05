/**
 * AI-driven follow-up question suggester for guided inspection interviews.
 *
 * Composes the multi-model-fallback gateway helper
 * (lib/services/ai/anthropic-gateway.callAnthropicWithFallback). Uses the
 * Haiku 4.5 → 3.5 fallback chain.
 *
 * Graceful-PARSE-fail semantic: when the model output isn't valid JSON the
 * service logs internally and returns ok({question: null, reason:
 * "all covered"}) — parse failures never bubble to the caller as a
 * ServiceResult failure. API/gateway failures still surface as
 * {ok: false, reason: AnthropicReason}.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { requireAiTaskPolicy } from "@/lib/ai/task-policy";
import { buildAiUsageMetadata } from "@/lib/ai/usage-metadata";
import { ok, type ServiceResult } from "@/lib/services/_shared/result";
import {
  callAnthropicWithFallback,
  type AnthropicReason,
} from "./anthropic-gateway";

const MAX_INPUT_ANSWERS = 40;
const MAX_INPUT_REMAINING = 40;
const MAX_FIELD_CHARS = 500;

const SYSTEM_PROMPT = `You are assisting an Australian water-damage restoration technician during a guided inspection interview.

Your single job: propose ONE targeted follow-up question based on the technician's prior answers that is NOT already covered by the remaining template questions.

Strict rules:
- Australian English (e.g. "mould", not "mold"; "colour", not "color").
- Ask ONE concise question only, in plain conversational language the technician can answer verbally on site.
- The question must be directly motivated by something in the prior answers (e.g. a mentioned hazard, material, or timing).
- Do NOT invent IICRC, AS/NZS, WHS, or any other compliance references, section numbers, or standards.
- Do NOT duplicate or paraphrase any question in the "Remaining template questions" list.
- Do NOT ask for personal contact details (name, address, email, phone).
- If the prior answers and remaining template already cover the likely follow-ups, return question = null.

Respond with ONLY a JSON object, no prose, no markdown fences:
{"question": "<the follow-up question, or null>", "reasoning": "<1 short sentence: why this follow-up is useful, referencing the prior answer that motivated it>"}

If nothing useful remains, respond exactly:
{"question": null, "reasoning": "all covered"}`;

export type SuggestNextReason = AnthropicReason;

export interface AnsweredQuestion {
  questionText: string;
  answer: unknown;
}

export interface RemainingQuestion {
  questionText: string;
}

export type SuggestNextResult =
  | { question: string; reasoning: string }
  | { question: null; reason: string };

function truncate(input: string, max = MAX_FIELD_CHARS): string {
  if (input.length <= max) return input;
  return input.slice(0, max) + "…";
}

function formatAnswerForPrompt(answer: unknown): string {
  if (answer == null) return "(no answer)";
  if (typeof answer === "string") return truncate(answer);
  if (Array.isArray(answer)) return truncate(answer.join(", "));
  if (typeof answer === "object") {
    try {
      return truncate(JSON.stringify(answer));
    } catch {
      return "(unserialisable answer)";
    }
  }
  return truncate(String(answer));
}

export async function suggestNextInterviewQuestion(args: {
  apiKey: string;
  answered: AnsweredQuestion[];
  remaining: RemainingQuestion[];
}): Promise<ServiceResult<SuggestNextResult, SuggestNextReason>> {
  const policy = requireAiTaskPolicy("fast_classification");
  const usageMetadata = buildAiUsageMetadata({
    taskClass: policy.taskClass,
    providerFamily: "anthropic-platform",
    tenantContext: { userId: "system" },
    executionMode: "synchronous",
  });
  void usageMetadata;

  const answeredCapped = args.answered.slice(-MAX_INPUT_ANSWERS);
  const remainingCapped = args.remaining.slice(0, MAX_INPUT_REMAINING);

  const answeredBlock = answeredCapped
    .map(
      (qa, i) =>
        `${i + 1}. Q: ${truncate(qa.questionText ?? "")}\n   A: ${formatAnswerForPrompt(qa.answer)}`,
    )
    .join("\n");

  const remainingBlock =
    remainingCapped.length > 0
      ? remainingCapped
          .map((q, i) => `${i + 1}. ${truncate(q.questionText ?? "")}`)
          .join("\n")
      : "(none)";

  const userPrompt = `Prior answered questions:
${answeredBlock}

Remaining template questions (do not duplicate):
${remainingBlock}

Propose ONE follow-up question, or null if all covered.`;

  const gatewayResult = await callAnthropicWithFallback({
    userId: "system",
    apiKey: args.apiKey,
    request: {
      system: SYSTEM_PROMPT,
      max_tokens: 250,
      temperature: 0.4,
      messages: [{ role: "user", content: userPrompt }],
    },
    models: [
      { name: "claude-haiku-4-5-20251001", maxTokens: 250 },
      { name: "claude-haiku-4-5-20251001", maxTokens: 250 },
    ],
    agentName: "InterviewSuggestNext",
  });

  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  const message = gatewayResult.data;
  const firstBlock = message.content[0];
  const responseText =
    firstBlock?.type === "text" ? firstBlock.text.trim() : "";

  // Extract JSON object defensively (model may wrap in text/backticks).
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : responseText;

  let parsed: { question: string | null; reasoning?: string };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.warn(
      "[suggest-next] Failed to parse model output, returning null suggestion",
    );
    return ok({ question: null, reason: "all covered" });
  }

  if (!parsed || typeof parsed !== "object") {
    return ok({ question: null, reason: "all covered" });
  }

  const question =
    typeof parsed.question === "string" && parsed.question.trim().length > 0
      ? parsed.question.trim()
      : null;
  const reasoning =
    typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : "";

  if (question) {
    return ok({
      question,
      reasoning: reasoning || "Follow-up based on prior answers",
    });
  }
  return ok({ question: null, reason: reasoning || "all covered" });
}
