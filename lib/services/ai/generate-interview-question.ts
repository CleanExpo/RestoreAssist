/**
 * AI-driven follow-up question generator for client intake conversations.
 *
 * Wraps lib/anthropic-models.tryClaudeModels (multi-model fallback chain)
 * with a structured ServiceResult envelope. The route owns auth, rate-limit,
 * idempotency, subscription gate, and HTTP error mapping.
 *
 * Why this service bypasses lib/services/ai/anthropic-gateway: the route
 * uses tryClaudeModels (multi-model fallback), which the single-model
 * gateway can't compose. A future callAnthropicWithFallback gateway
 * extension would let this service collapse to the gateway pattern.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import Anthropic from "@anthropic-ai/sdk";
import { tryClaudeModels } from "@/lib/anthropic-models";
import { createCachedSystemPrompt } from "@/lib/anthropic/features/prompt-cache";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";
import type { AnthropicReason } from "./anthropic-gateway";

const SYSTEM_PROMPT = `You are a professional water damage restoration assistant helping to gather information from a client about a water damage incident. 

Your role is to ask natural, conversational follow-up questions to gather all necessary information about:
- The extent of the damage (which rooms/areas are affected)
- The source of the water (where did it come from)
- When the incident occurred (timeline)
- Any visible damage or concerns
- Safety concerns

Ask ONE clear, specific question at a time. Be conversational and empathetic, like a real person would ask. Don't be robotic.

IMPORTANT: After gathering sufficient information about the incident (typically 4-6 exchanges), you MUST ask for (in this order):
1. Client's full name
2. Property address (where the incident occurred)
3. Client's email address
4. Client's phone number

Only mark as complete (isComplete: true) AFTER you have collected all four pieces of information: name, address, email, and phone number.

Format your response as a JSON object with:
- "question": the follow-up question to ask (or a conclusion message if enough info gathered)
- "isComplete": true if enough information has been gathered AND you have collected client name, address, email, and phone number, false otherwise

Example responses:
- Early in conversation: "The entire house?"
- Mid conversation: "Where did the water come from?"
- Mid conversation: "When did this happen?"
- After incident details: "Thank you for that information. May I please have your full name?"
- After name: "Thank you. And what is the property address where this incident occurred?"
- After address: "Thank you. What is your email address?"
- After email: "Thank you. And finally, what is your phone number?"
- When complete: "Thank you for providing all the information. A technician will review your case and contact you soon."`;

const AUTO_COMPLETE_THRESHOLD = 6;
const HARD_AUTO_COMPLETE = 8;
const MAX_TOKENS = 500;

export type GenerateQuestionReason = AnthropicReason | "PARSE_FAILED";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateQuestionResult {
  question: string;
  isComplete: boolean;
}

export async function generateInterviewQuestion(args: {
  apiKey: string;
  conversation: ConversationMessage[];
}): Promise<ServiceResult<GenerateQuestionResult, GenerateQuestionReason>> {
  const anthropic = new Anthropic({ apiKey: args.apiKey });
  const conversationLength = args.conversation.length;

  try {
    const message = await tryClaudeModels(
      anthropic,
      {
        system: [createCachedSystemPrompt(SYSTEM_PROMPT)],
        max_tokens: MAX_TOKENS,
        messages: [
          ...args.conversation.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          {
            role: "user" as const,
            content:
              "Generate the next question or conclusion as a JSON object with 'question' and 'isComplete' fields. If enough information has been gathered, set isComplete to true and provide a conclusion message.",
          },
        ],
      },
      undefined,
      { agentName: "QuestionGenerator", enableCacheMetrics: true },
    );

    const responseText =
      message.content[0]?.type === "text"
        ? message.content[0].text
        : JSON.stringify(message.content[0] ?? "");

    let question = "";
    let isComplete = false;

    try {
      const parsed = JSON.parse(responseText);
      question = parsed.question || responseText;
      isComplete = parsed.isComplete || false;
    } catch {
      // Plain-text fallback: auto-complete after AUTO_COMPLETE_THRESHOLD exchanges
      question = responseText;
      isComplete = conversationLength >= AUTO_COMPLETE_THRESHOLD;
    }

    // Hard auto-complete safety net at HARD_AUTO_COMPLETE
    if (!isComplete && conversationLength >= HARD_AUTO_COMPLETE) {
      isComplete = true;
      question =
        question ||
        "Thank you for providing all the information. A technician will review your case and contact you soon.";
    }

    return ok({ question, isComplete });
  } catch (err: unknown) {
    const status =
      err && typeof err === "object" && "status" in err && typeof err.status === "number"
        ? err.status
        : undefined;
    const detail = err instanceof Error ? err.message : String(err);

    if (status === 429) {
      return fail("RATE_LIMITED", { detail, retryAfterMs: 30000, cause: err });
    }
    if (status === 529) {
      return fail("MODEL_OVERLOADED", { detail, retryAfterMs: 10000, cause: err });
    }
    return fail("API_ERROR", { detail, cause: err });
  }
}
