// RA-1132g: Claude Opus 4.7 cloud client for Live Teacher
// TODO: import from lib/live-teacher/types.ts once RA-1132b merges

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { TOOL_DEFINITIONS, dispatchTool, type ToolName } from "./tools";

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
  /** Readings still above their material dry standard, as short summaries. */
  wetReadings: string[];
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ClaudeCloudInput = {
  sessionId: string;
  context: TeacherContext;
  history: TeacherTurn[];
  userUtterance: string;
  /**
   * RA-6963 (BYOK, P1) — the calling workspace's own Anthropic key, resolved by
   * the turn route via resolveWorkspaceAiKey. Live Teacher is a customer AI
   * workload; it must never spend the platform ANTHROPIC_API_KEY, so there is
   * no module-level client and the key is required per call.
   */
  apiKey: string;
};

export type ClaudeCloudResult = {
  content: string;
  clauseRefs: string[];
  confidence: number;
  toolCalls: Array<{
    name: string;
    args: unknown;
    id: string;
    result?: unknown;
    error?: string;
    durationMs?: number;
    /** RA-1132f-3 — a confirm-required tool that was proposed, not executed. */
    proposed?: boolean;
  }>;
  inputTokens: number;
  outputTokens: number;
  costAudCents: number;
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an IICRC S500:2021-certified water damage restoration coach for Australian and New Zealand technicians. You guide them through inspections in real-time.

Rules:
- Australian English spelling (mould not mold, labour not labor, colour not color)
- Every factual claim MUST end with a clause reference: [S500:2021 §X.Y.Z] or [AS/NZS 4360:2004 §4.3]
- If uncertain, hedge with "Let me check — I'm not fully sure"
- Never fabricate clause references
- Cat/Class determinations cite S500:2021 §10
- For NZ jurisdiction, also consider NZBS E2/E3 clauses
- The user's message begins with a [Context: room, stage, jurisdiction, missingFields, stillWet] block describing where the technician is in the job. Treat every item in missingFields as not yet captured. stillWet lists materials already measured that remain above their dry standard.
- When stillWet is non-empty, factor it into drying/scope advice — those materials are not yet dry and must keep being dried and monitored before sign-off [S500:2021 §12.2].
- Coach proactively: when missingFields is non-empty, first give one short, specific reminder of what's still outstanding for the current stage (e.g. "Before we move on — you haven't logged the water category for this room [S500:2021 §10.5]"), then answer the question. When missingFields is empty, just answer. This is how a first-week technician reaches veteran-level completeness.
- When the technician reports a moisture reading (a value with a location and material), call the take_reading tool to log it, then confirm what you logged. The current inspection is already known — never ask the technician for an inspection ID.
- When the technician asks what is still missing, whether the report is complete, or is about to submit, call the check_report_gaps tool and relay the gaps plainly (highest-severity first). If there are none, reassure them the report looks complete. This is read-only — it never changes the job.
- When a genuine WHS hazard is present (confined space, asbestos, biohazard, electrical), call the flag_whs_hazard tool. This does NOT record anything on its own — it proposes the hazard for the technician to confirm. Tell them plainly that you have flagged it for their confirmation and to review it; never state it as recorded.
- When the technician identifies work required on site (remove carpet, sanitise materials, install dehumidification, etc.), call the fill_scope_item tool to add it to the scope of works, then confirm what you added. Include a quantity and unit when known, and cite the IICRC clause. The technician reviews all scope items before finalising.
- Output format: natural spoken English, concise (under 40 words per turn unless synthesizing a report)`;

// ---------------------------------------------------------------------------
// Tool layer (RA-1132f)
// ---------------------------------------------------------------------------

/**
 * Enabled tools. take_reading logs a moisture reading (write); check_report_gaps
 * is a read-only completeness audit (pulled forward from Phase 2 — low-risk).
 * capture_photo needs a client image source the text UI can't provide yet; the
 * remaining tools land in later phases. Gating here (not just in the prompt)
 * means the model cannot invoke an unlisted tool even if it tries.
 */
const PHASE1_TOOL_NAMES: readonly ToolName[] = [
  "take_reading",
  "check_report_gaps",
  "flag_whs_hazard",
  "fill_scope_item",
];

/**
 * Confirm-required tools are NOT executed during the turn. They write
 * compliance-sensitive records (WHSIncident), so the AI only PROPOSES them; the
 * technician confirms and a separate endpoint performs the write. This is the
 * confirm-before-write pattern (RA-1132f-3). The tool is still offered to the
 * model, but its handler never runs here.
 */
const CONFIRM_REQUIRED_TOOLS: readonly ToolName[] = ["flag_whs_hazard"];

const ENABLED_TOOLS = TOOL_DEFINITIONS.filter((d) =>
  PHASE1_TOOL_NAMES.includes(d.name),
) as unknown as Anthropic.Tool[];

/** Bound the tool-use loop so a misbehaving model can't spin indefinitely. */
const MAX_TOOL_ITERATIONS = 4;

/**
 * Stable signature for a tool_use block: tool name + its args with keys sorted
 * so re-emissions in a different key order still collide. Used for turn-level
 * idempotency — write tools (take_reading, fill_scope_item) are unconditional
 * create()s, so an identical re-emission within the turn (common on model
 * self-correction/retry) would double-write without this guard. Only IDENTICAL
 * (same tool + same args) blocks collide; genuinely different readings differ in
 * args and run independently.
 */
function toolSignature(name: string, args: Record<string, unknown>): string {
  const sorted = Object.keys(args)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = args[key];
      return acc;
    }, {});
  return `${name}:${JSON.stringify(sorted)}`;
}

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

// Allow the natural "[IICRC S500:2021 §10.5]" phrasing — an optional "IICRC "
// prefix before the standard token. The whole bracketed match (prefix included)
// is stored in clauseRefs; parseClauseRef in citation-validity.ts strips the
// prefix, so both agree on the parsed standard/clause/edition.
const CLAUSE_REF_REGEX = /\[(?:IICRC\s+)?(S500|AS\/NZS|NZBS)[^\]]+\]/g;

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

  // Freshly-built inspection state for THIS turn. The system prompt tells the
  // model the user message begins with this block and to coach off its
  // missingFields/stillWet, so it must reach the model on EVERY turn — not only
  // the first (history is non-empty from turn 2 onward).
  const contextBlock = `[Context: room=${context.currentRoom ?? "unset"}, stage=${context.stage}, jurisdiction=${context.jurisdiction}, missingFields=${context.missingFields.join(", ") || "none"}, stillWet=${context.wetReadings.join("; ") || "none"}]`;

  // Map history turns (skip system — handled in system prompt param). Historical
  // utterances stay raw: retro-prepending the block to each would bloat the
  // conversation and duplicate stale context.
  for (const turn of history) {
    if (turn.role === "system") continue;
    messages.push({
      role: turn.role,
      content: turn.content,
    });
  }

  // Prepend the current inspection state to the CURRENT utterance on every turn,
  // so the model always sees the latest room/fields/wet-readings.
  messages.push({
    role: "user",
    content: `${contextBlock}\n\n${userUtterance}`,
  });

  return messages;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function invokeClaudeCloud(
  input: ClaudeCloudInput,
): Promise<ClaudeCloudResult> {
  // RA-6963 (BYOK, P1) — construct the Anthropic client per call from the
  // workspace-resolved key. No module-level platform client; a customer
  // workload never spends the platform ANTHROPIC_API_KEY.
  const anthropic = new Anthropic({ apiKey: input.apiKey });

  const messages = buildMessages(
    input.history,
    input.userUtterance,
    input.context,
  );

  const executedToolCalls: ClaudeCloudResult["toolCalls"] = [];
  // Turn-level idempotency: signature -> the tool_result content already handed
  // back for it. Spans every iteration of THIS turn's loop, so a write tool
  // re-emitted with identical args (self-correction/retry, or twice in one
  // response) is answered from the prior result instead of dispatching again.
  const executedSignatures = new Map<string, string>();
  let content = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      // claude-opus-4-7 does not support temperature/top_p — omit those params.
      // The model string is a plain string; SDK typings may lag the model
      // release cadence.
      const response = await (
        anthropic.messages.create as (
          params: Anthropic.MessageCreateParamsNonStreaming,
        ) => Promise<Anthropic.Message>
      )({
        model: "claude-opus-4-7" as string,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages,
        ...(ENABLED_TOOLS.length > 0 ? { tools: ENABLED_TOOLS } : {}),
      });

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      if (textBlock?.text) content = textBlock.text;

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        break;
      }

      // Execute each requested tool through the fail-closed dispatcher. The
      // model-supplied inspectionId is REPLACED with the session's real one
      // (never trust a model-controlled id), and dispatchTool re-validates
      // tenancy against the authenticated userId before running (IDOR guard).
      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const safeArgs = {
          ...(block.input as Record<string, unknown>),
          inspectionId: input.context.inspectionId,
        };

        // Confirm-required tools (e.g. flag_whs_hazard) are PROPOSED, never run
        // here: the compliance write happens only after the technician confirms
        // via the confirm endpoint. Record the proposal and tell the model it is
        // not yet logged, so it never claims otherwise.
        if (CONFIRM_REQUIRED_TOOLS.includes(block.name as ToolName)) {
          executedToolCalls.push({
            name: block.name,
            args: safeArgs,
            id: block.id,
            proposed: true,
          });
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: block.id,
            content:
              "Proposed to the technician for confirmation. It is NOT recorded yet — tell them you have flagged it for their review; do not claim it is logged.",
          });
          continue;
        }

        // Turn-level idempotency guard (after the id-clamp, before dispatch): if
        // an identical tool + args already ran successfully this turn, skip the
        // write and return the prior result. Only successful runs are recorded,
        // so a failed call can still be retried to completion.
        const signature = toolSignature(block.name, safeArgs);
        const priorResult = executedSignatures.get(signature);
        if (priorResult !== undefined) {
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: priorResult,
          });
          continue;
        }

        const startedAt = Date.now();
        let result: unknown;
        let error: string | undefined;
        try {
          if (!PHASE1_TOOL_NAMES.includes(block.name as ToolName)) {
            throw new Error(`Tool "${block.name}" is not enabled in this phase`);
          }
          result = await dispatchTool(block.name as ToolName, safeArgs, {
            userId: input.context.userId,
          });
        } catch (err) {
          // Rule 7: log internally; hand the model a generic error to recover.
          console.error("[invokeClaudeCloud] tool dispatch failed:", err);
          error = err instanceof Error ? err.message : "Tool execution failed";
        }
        executedToolCalls.push({
          name: block.name,
          args: safeArgs,
          id: block.id,
          result,
          error,
          durationMs: Date.now() - startedAt,
        });
        const resultContent = error
          ? `Error: ${error}`
          : JSON.stringify(result ?? {});
        if (!error) executedSignatures.set(signature, resultContent);
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultContent,
          ...(error ? { is_error: true } : {}),
        });
      }

      // Feed the tool results back so the model can summarise for the tech.
      messages.push({
        role: "assistant",
        content: response.content as Anthropic.ContentBlockParam[],
      });
      messages.push({ role: "user", content: toolResultBlocks });
    }
  } catch (err) {
    // Rule 7: never expose error.message in the response body; log internally.
    console.error("[invokeClaudeCloud] Anthropic API error:", err);
    // Nothing produced yet → preserve the existing safe-fallback contract.
    if (!content && executedToolCalls.length === 0) {
      // RA-7060: this fallback is the ONLY thing the technician sees when the
      // model call fails. Without a signal, a misconfigured BYOK key fails every
      // turn silently. Emit a structured, alertable line (Vercel captures
      // console.error). Marker + sessionId let ops trace which workspace/session
      // is failing; never log the API key or the request body.
      console.error("[live-teacher] turn fallback (model call failed)", {
        sessionId: input.sessionId,
        model: "claude-opus-4-7",
        errorName: err instanceof Error ? err.name : "UnknownError",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
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
  }

  const clauseRefs = extractClauseRefs(content);
  const confidence = deriveConfidence(content, clauseRefs);
  const costAudCents = computeCostAudCents(inputTokens, outputTokens);

  // TODO RA-1087: integrate logAiUsage once the Live Teacher session schema
  // exposes workspaceId. For now, update session cost tallies directly.
  // RA-7052: awaited before the return — a serverless freeze after the return
  // would drop a deferred setImmediate write, silently losing per-turn cost.
  // A cost-write failure must not abort the turn or lose the utterance, so it
  // is logged and swallowed, never rethrown.
  try {
    await prisma.liveTeacherSession.updateMany({
      where: { id: input.sessionId },
      data: {
        modelUsedCloud: "claude-opus-4-7",
        totalInputTokens: { increment: inputTokens },
        totalOutputTokens: { increment: outputTokens },
        totalCostAudCents: { increment: costAudCents },
      },
    });
  } catch (err: unknown) {
    console.error(
      "[invokeClaudeCloud] Failed to update session cost tally:",
      err,
    );
  }

  return {
    content,
    clauseRefs,
    confidence,
    toolCalls: executedToolCalls,
    inputTokens,
    outputTokens,
    costAudCents,
  };
}
