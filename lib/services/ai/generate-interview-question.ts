/**
 * AI-driven follow-up question generator for client intake conversations.
 *
 * Composes the multi-model-fallback gateway helper
 * (lib/services/ai/anthropic-gateway.callAnthropicWithFallback) which wraps
 * tryClaudeModels with the standard ServiceResult envelope. The route owns
 * auth, rate-limit, idempotency, subscription gate, and HTTP error mapping.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { createCachedSystemPrompt } from "@/lib/anthropic/features/prompt-cache";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";
import {
  callAnthropicWithFallback,
  type AnthropicReason,
} from "./anthropic-gateway";

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
  const conversationLength = args.conversation.length;

  const gatewayResult = await callAnthropicWithFallback({
    userId: "system",
    apiKey: args.apiKey,
    request: {
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
    agentName: "QuestionGenerator",
    enableCacheMetrics: true,
  });

  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  const message = gatewayResult.data;
  const firstBlock = message.content[0];
  const responseText =
    firstBlock?.type === "text"
      ? firstBlock.text
      : JSON.stringify(firstBlock ?? "");

  let question = "";
  let isComplete = false;

  try {
    const parsed = JSON.parse(responseText);
    question = parsed.question || responseText;
    isComplete = parsed.isComplete || false;
  } catch {
    question = responseText;
    isComplete = conversationLength >= AUTO_COMPLETE_THRESHOLD;
  }

  if (!isComplete && conversationLength >= HARD_AUTO_COMPLETE) {
    isComplete = true;
    question =
      question ||
      "Thank you for providing all the information. A technician will review your case and contact you soon.";
  }

  return ok({ question, isComplete });
}
