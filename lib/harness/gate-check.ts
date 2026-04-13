/**
 * Confidence-Weighted Gate Check (RA-674 / KARPATHY-1)
 *
 * Evaluates AI task output across 5 dimensions, emits a quality score (0–100)
 * and a confidence score (0–100), then routes to one of three decisions:
 *
 *   AUTO_SHIP  — high quality + high confidence → ship without human review
 *   FLAG       — medium quality or confidence → surface to human for review
 *   RETRY      — low quality or confidence → re-attempt the task
 *
 * Thresholds are read from .harness/config.yaml (per-project overrides supported).
 * Every evaluation is persisted to the GateCheck table for observability.
 * FLAG and RETRY decisions trigger a Telegram alert when credentials are configured.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

// ── Types ──────────────────────────────────────────────────────────────────

export type GateDecision = "AUTO_SHIP" | "FLAG" | "RETRY";

export interface DimensionResult {
  dimension: string;
  score: number; // 0–10
  confidence: number; // 0–100
  reason: string;
}

export interface GateCheckInput {
  projectKey: string;
  taskId?: string;
  taskDescription: string;
  taskOutput: string;
  /** Previous retry count — used to cap retries at max_retries */
  retryCount?: number;
}

export interface GateCheckResult {
  id: string;
  projectKey: string;
  taskId?: string;
  qualityScore: number;
  confidence: number;
  decision: GateDecision;
  dimensions: DimensionResult[];
  retryCount: number;
  telegramSent: boolean;
}

// ── Config ─────────────────────────────────────────────────────────────────

interface ProjectThresholds {
  auto_ship_quality: number;
  auto_ship_confidence: number;
  retry_below_quality: number;
  retry_below_confidence: number;
  max_retries: number;
}

const DEFAULT_THRESHOLDS: ProjectThresholds = {
  auto_ship_quality: 80,
  auto_ship_confidence: 70,
  retry_below_quality: 50,
  retry_below_confidence: 40,
  max_retries: 2,
};

const PROJECT_THRESHOLDS: Record<string, Partial<ProjectThresholds>> = {
  "scope-quality": {
    auto_ship_quality: 85,
    auto_ship_confidence: 75,
    retry_below_quality: 55,
    retry_below_confidence: 45,
    max_retries: 3,
  },
  "report-builder": {
    auto_ship_quality: 80,
    auto_ship_confidence: 70,
  },
  "evidence-classification": {
    auto_ship_quality: 75,
    auto_ship_confidence: 65,
    retry_below_quality: 45,
    retry_below_confidence: 35,
  },
  "interview-engine": {
    auto_ship_quality: 80,
    auto_ship_confidence: 70,
  },
};

function getThresholds(projectKey: string): ProjectThresholds {
  const override = PROJECT_THRESHOLDS[projectKey] ?? {};
  return { ...DEFAULT_THRESHOLDS, ...override };
}

// ── Evaluation prompt ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a quality assurance evaluator for an AI-driven restoration compliance platform.

Evaluate the given task output across 5 dimensions. For each dimension return:
  - score: integer 0–10 (10 = perfect)
  - confidence: integer 0–100 (your confidence in this score)
  - reason: one concise sentence explaining the score

Dimensions:
1. correctness   — Is the output factually and logically correct?
2. completeness  — Are all required fields/sections present and non-empty?
3. compliance    — Does the output meet IICRC/Australian regulatory requirements?
4. coherence     — Does the output read naturally without contradictions?
5. safety        — Is the output free of hallucinations, harmful claims, or misleading content?

Respond ONLY with valid JSON matching this exact structure:
{
  "dimensions": [
    { "dimension": "correctness",  "score": 0, "confidence": 0, "reason": "" },
    { "dimension": "completeness", "score": 0, "confidence": 0, "reason": "" },
    { "dimension": "compliance",   "score": 0, "confidence": 0, "reason": "" },
    { "dimension": "coherence",    "score": 0, "confidence": 0, "reason": "" },
    { "dimension": "safety",       "score": 0, "confidence": 0, "reason": "" }
  ]
}`;

// ── Core evaluation ────────────────────────────────────────────────────────

async function evaluateOutput(
  taskDescription: string,
  taskOutput: string,
): Promise<{ dimensions: DimensionResult[]; rawResponse: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });

  const userMessage = `TASK DESCRIPTION:\n${taskDescription}\n\nTASK OUTPUT:\n${taskOutput}`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawResponse =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Strip markdown fences if present
  const cleaned = rawResponse
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  const parsed = JSON.parse(cleaned) as { dimensions: DimensionResult[] };

  return { dimensions: parsed.dimensions, rawResponse };
}

// ── Scoring ────────────────────────────────────────────────────────────────

function computeScores(dimensions: DimensionResult[]): {
  qualityScore: number;
  confidence: number;
} {
  if (dimensions.length === 0) return { qualityScore: 0, confidence: 0 };

  // Quality: weighted mean of dimension scores, scaled to 0–100
  const qualityScore = Math.round(
    (dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length) * 10,
  );

  // Confidence: mean of per-dimension confidence values
  const confidence = Math.round(
    dimensions.reduce((sum, d) => sum + d.confidence, 0) / dimensions.length,
  );

  return { qualityScore, confidence };
}

// ── Decision logic ─────────────────────────────────────────────────────────

function makeDecision(
  qualityScore: number,
  confidence: number,
  retryCount: number,
  thresholds: ProjectThresholds,
): GateDecision {
  // If max retries exhausted, escalate to FLAG even on low quality
  if (retryCount >= thresholds.max_retries) return "FLAG";

  if (
    qualityScore >= thresholds.auto_ship_quality &&
    confidence >= thresholds.auto_ship_confidence
  ) {
    return "AUTO_SHIP";
  }

  if (
    qualityScore < thresholds.retry_below_quality ||
    confidence < thresholds.retry_below_confidence
  ) {
    return "RETRY";
  }

  return "FLAG";
}

// ── Telegram alert ─────────────────────────────────────────────────────────

async function sendTelegramAlert(result: {
  projectKey: string;
  taskId?: string;
  qualityScore: number;
  confidence: number;
  decision: GateDecision;
  id: string;
}): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const emoji = result.decision === "FLAG" ? "🚩" : "🔄";
  const text =
    `${emoji} *Gate Check: ${result.decision}*\n` +
    `Project: \`${result.projectKey}\`\n` +
    (result.taskId ? `Task: \`${result.taskId}\`\n` : "") +
    `Quality: ${result.qualityScore}/100 | Confidence: ${result.confidence}/100\n` +
    `ID: \`${result.id}\``;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ── Main export ────────────────────────────────────────────────────────────

export async function runGateCheck(
  input: GateCheckInput,
): Promise<GateCheckResult> {
  const retryCount = input.retryCount ?? 0;
  const thresholds = getThresholds(input.projectKey);

  const { dimensions, rawResponse } = await evaluateOutput(
    input.taskDescription,
    input.taskOutput,
  );

  const { qualityScore, confidence } = computeScores(dimensions);
  const decision = makeDecision(
    qualityScore,
    confidence,
    retryCount,
    thresholds,
  );

  // Persist to DB
  const record = await prisma.gateCheck.create({
    data: {
      projectKey: input.projectKey,
      taskId: input.taskId,
      qualityScore,
      confidence,
      decision,
      dimensions: JSON.stringify(dimensions),
      retryCount,
      rawResponse,
    },
  });

  let telegramSent = false;
  if (decision === "FLAG" || decision === "RETRY") {
    telegramSent = await sendTelegramAlert({
      projectKey: input.projectKey,
      taskId: input.taskId,
      qualityScore,
      confidence,
      decision,
      id: record.id,
    });

    if (telegramSent) {
      await prisma.gateCheck.update({
        where: { id: record.id },
        data: { telegramSent: true },
      });
    }
  }

  return {
    id: record.id,
    projectKey: input.projectKey,
    taskId: input.taskId,
    qualityScore,
    confidence,
    decision,
    dimensions,
    retryCount,
    telegramSent,
  };
}
