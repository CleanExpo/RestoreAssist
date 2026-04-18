// RA-1132g: Claude Opus 4.7 cloud client for Live Teacher
// TODO: import from lib/live-teacher/types.ts once RA-1132b merges

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Inline type fallbacks — remove once RA-1132b lands and types.ts is available
// ---------------------------------------------------------------------------

export type TeacherTurn = {
  role: "user" | "assistant" | "system";
  content: string;
  clauseRefs?: string[];
  confidence?: number;
};

export type TeacherContext = {
  inspectionId: string;
  userId: string;
  jurisdiction: "AU" | "NZ";
  currentRoom: string | null;
  stage:
    | "arrival"
    | "walkthrough"
    | "moisture"
    | "classification"
    | "scope"
    | "submission";
  missingFields: string[];
};

// ---------------------------------------------------------------------------
// SDK client — matches the canonical pattern in lib/anthropic.ts
// ---------------------------------------------------------------------------

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ClaudeCloudInput = {
  sessionId: string;
  context: TeacherContext;
  history: TeacherTurn[];
  userUtterance: string;
};

export type ClaudeCloudResult = {
  content: string;
  clauseRefs: string[];
  confidence: number;
  toolCalls: Array<{ name: string; args: unknown; id: string }>;
  inputTokens: number;
  outputTokens: number;
  costAudCents: number;
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an IICRC S500:2025-certified water damage restoration coach for Australian and New Zealand technicians. You guide them through inspections in real-time.

Rules:
- Australian English spelling (mould not mold, labour not labor, colour not color)
- Every factual claim MUST end with a clause reference: [S500:2025 §X.Y.Z] or [AS/NZS 4360:2004 §4.3]
- If uncertain, hedge with "Let me check — I'm not fully sure"
- Never fabricate clause references
- Cat/Class determinations cite S500:2025 §10
- For NZ jurisdiction, also consider NZBS E2/E3 clauses
- Output format: natural spoken English, concise (under 40 words per turn unless synthesizing a report)`;

// ---------------------------------------------------------------------------
// Cost calculation helpers
// ---------------------------------------------------------------------------

/** Opus 4.7 pricing: $5.00 input / $25.00 output per million tokens (USD) */
const PRICE_INPUT_USD_PER_TOKEN = 5.0 / 1_000_000;
const PRICE_OUTPUT_USD_PER_TOKEN = 25.0 / 1_000_000;

/**
 * Conversion rate: 1 USD = 155 AUD cents (override with RATE_USD_AUD env var).
 * Env var is expected as a plain number, e.g. "155".
 */
function getUsdToAudCents(): number {
  const env = process.env.RATE_USD_AUD;
  if (env) {
    const parsed = parseFloat(env);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 155;
}

function computeCostAudCents(
  inputTokens: number,
  outputTokens: number,
): number {
  const usdToAudCents = getUsdToAudCents();
  const costUsd =
    inputTokens * PRICE_INPUT_USD_PER_TOKEN +
    outputTokens * PRICE_OUTPUT_USD_PER_TOKEN;
  return Math.round(costUsd * usdToAudCents);
}

// ---------------------------------------------------------------------------
// Clause reference extraction
// ---------------------------------------------------------------------------

const CLAUSE_REF_REGEX = /\[(S500|AS\/NZS|NZBS)[^\]]+\]/g;

function extractClauseRefs(text: string): string[] {
  const matches = text.match(CLAUSE_REF_REGEX);
  return matches ? Array.from(new Set(matches)) : [];
}

// ---------------------------------------------------------------------------
// Confidence derivation
// ---------------------------------------------------------------------------

/**
 * Derive a 0–100 confidence score from the response.
 * Heuristics:
 *   - Base: 80
 *   - Each clause ref found: +3 (capped at +15)
 *   - Hedge phrases detected: -30
 */
function deriveConfidence(text: string, clauseRefs: string[]): number {
  const hedges = [
    "let me check",
    "not fully sure",
    "i'm not sure",
    "i am not sure",
    "uncertain",
    "may be",
    "might be",
  ];
  const lower = text.toLowerCase();
  const hasHedge = hedges.some((h) => lower.includes(h));
  const refBonus = Math.min(clauseRefs.length * 3, 15);
  const base = hasHedge ? 50 : 80;
  return Math.min(100, base + refBonus);
}

// ---------------------------------------------------------------------------
// Message builder
// ---------------------------------------------------------------------------

function buildMessages(
  history: TeacherTurn[],
  userUtterance: string,
  context: TeacherContext,
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  // Inject a context block as the first user message if history is empty,
  // or prepend to the current utterance.
  const contextBlock = `[Context: room=${context.currentRoom ?? "unset"}, stage=${context.stage}, jurisdiction=${context.jurisdiction}, missingFields=${context.missingFields.join(", ") || "none"}]`;

  // Map history turns (skip system — handled in system prompt param)
  for (const turn of history) {
    if (turn.role === "system") continue;
    messages.push({
      role: turn.role,
      content: turn.content,
    });
  }

  // Append the current user utterance with context
  const userContent =
    messages.length === 0
      ? `${contextBlock}\n\n${userUtterance}`
      : userUtterance;

  messages.push({ role: "user", content: userContent });

  return messages;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function invokeClaudeCloud(
  input: ClaudeCloudInput,
): Promise<ClaudeCloudResult> {
  // TODO: wire tool definitions from lib/live-teacher/tools/ once RA-1132f lands
  const tools: Anthropic.Tool[] = [];

  const messages = buildMessages(
    input.history,
    input.userUtterance,
    input.context,
  );

  let response: Anthropic.Message;
  try {
    // claude-opus-4-7 does not support temperature/top_p — omit those params.
    // The model string is passed as a plain string; SDK typings may lag behind
    // the actual model release cadence.
    response = await (
      anthropic.messages.create as (
        params: Anthropic.MessageCreateParamsNonStreaming,
      ) => Promise<Anthropic.Message>
    )({
      model: "claude-opus-4-7" as string,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    });
  } catch (err) {
    // Rule 7: never expose error.message in the response body; log internally.
    console.error("[invokeClaudeCloud] Anthropic API error:", err);
    return {
      content: "I'm having trouble connecting — please try again",
      clauseRefs: [],
      confidence: 0,
      toolCalls: [],
      inputTokens: 0,
      outputTokens: 0,
      costAudCents: 0,
    };
  }

  // Extract text content
  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  const content = textBlock?.text ?? "";

  // Extract tool_use blocks (none expected until RA-1132f wires tools)
  const toolCalls = response.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    .map((b) => ({ name: b.name, args: b.input, id: b.id }));

  const clauseRefs = extractClauseRefs(content);
  const confidence = deriveConfidence(content, clauseRefs);

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costAudCents = computeCostAudCents(inputTokens, outputTokens);

  // TODO RA-1087: integrate logAiUsage once the Live Teacher session schema
  // exposes workspaceId. For now, update session cost tallies directly.
  setImmediate(() => {
    prisma.liveTeacherSession
      .updateMany({
        where: { id: input.sessionId },
        data: {
          modelUsedCloud: "claude-opus-4-7",
          totalInputTokens: { increment: inputTokens },
          totalOutputTokens: { increment: outputTokens },
          totalCostAudCents: { increment: costAudCents },
        },
      })
      .catch((err: unknown) => {
        console.error(
          "[invokeClaudeCloud] Failed to update session cost tally:",
          err,
        );
      });
  });

  return {
    content,
    clauseRefs,
    confidence,
    toolCalls,
    inputTokens,
    outputTokens,
    costAudCents,
  };
}
