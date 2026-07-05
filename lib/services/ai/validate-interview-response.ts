/**
 * AI-driven IICRC S500:2021 compliance validator for guided inspection
 * interview answers.
 *
 * Composes the multi-model-fallback gateway helper
 * (lib/services/ai/anthropic-gateway.callAnthropicWithFallback). Uses the
 * Haiku 4.5 → 3.5 fallback chain. The route owns auth, rate-limit,
 * subscription gate, request-validation gates (MAX_INPUT_ANSWERS,
 * empty-array 400), and response-shape concerns (validatedAt ISO
 * timestamp).
 *
 * Graceful-PARSE-fail semantic: when the model output isn't valid JSON
 * or doesn't contain a `findings` array, the service logs internally and
 * returns ok({findings: []}) — parse failures never bubble to the caller
 * as a ServiceResult failure. API/gateway failures still surface as
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

const MAX_FIELD_CHARS = 600;
const MAX_FINDINGS = 20;

const SYSTEM_PROMPT = `You are an IICRC S500:2021 compliance reviewer for Australian water-damage restoration inspections.

Your job: read the technician's answers from a guided inspection interview and flag anything that is inconsistent, missing, or non-compliant against IICRC S500:2021.

Strict rules:
- Australian English (e.g. "mould" not "mold"; "colour" not "color"; "category" not "class" for contamination).
- Only flag issues you are confident about. An empty findings list is correct and expected when answers are clean.
- Every message MUST cite a specific IICRC S500:2021 section in the form "S500:2021 §X.Y" (e.g. "S500:2021 §6.3", "S500:2021 §10.6.4"). Never abbreviate, never omit the year, never cite other standards you invent.
- Use severity "error" ONLY for direct contradictions with S500:2021 (e.g. Category 3 water treated as Category 1, missing PPE on Cat 3, drying timeframes clearly outside standard).
- Use severity "warn" for likely gaps, ambiguous answers, or compliance risks that a reviewer would query.
- Keep each message to 1–2 sentences. If a fix is obvious, include a short "suggestedFix".
- questionId must match the bracketed id from the input (e.g. q1, cmabc123); if a finding is not tied to one question, use null.
- Do NOT invent IICRC sections you are not certain about. If unsure of the exact section, omit that finding.
- Do NOT comment on spelling, grammar, or answer formatting — only on compliance substance.

Respond with ONLY a JSON object, no prose, no markdown fences:
{"findings": [{"questionId": "<id or null>", "severity": "warn"|"error", "message": "<text citing S500:2021 §X.Y>", "suggestedFix": "<optional short fix>"}]}

If everything looks clean, respond exactly:
{"findings": []}`;

export type ValidateInterviewReason = AnthropicReason;

export interface AnsweredQuestionForValidation {
  questionId?: string;
  questionText?: string;
  answer?: unknown;
}

export interface ValidationFinding {
  questionId: string | null;
  severity: "warn" | "error";
  message: string;
  suggestedFix?: string;
}

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

function coerceSeverity(value: unknown): "warn" | "error" {
  if (typeof value !== "string") return "warn";
  const v = value.toLowerCase().trim();
  return v === "error" ? "error" : "warn";
}

export async function validateInterviewResponse(args: {
  apiKey: string;
  answered: AnsweredQuestionForValidation[];
}): Promise<
  ServiceResult<{ findings: ValidationFinding[] }, ValidateInterviewReason>
> {
  const policy = requireAiTaskPolicy("fast_classification");
  const usageMetadata = buildAiUsageMetadata({
    taskClass: policy.taskClass,
    providerFamily: "anthropic-platform",
    tenantContext: { userId: "system" },
    executionMode: "synchronous",
  });
  void usageMetadata;

  const answeredBlock = args.answered
    .map((qa, i) => {
      const qid =
        typeof qa.questionId === "string" ? qa.questionId : `q${i + 1}`;
      const qtext = typeof qa.questionText === "string" ? qa.questionText : "";
      return `${i + 1}. [id=${qid}] Q: ${truncate(qtext)}\n   A: ${formatAnswerForPrompt(qa.answer)}`;
    })
    .join("\n");

  const userPrompt = `Answered interview questions:
${answeredBlock}

Validate these answers against IICRC S500:2021 and return findings.`;

  const gatewayResult = await callAnthropicWithFallback({
    userId: "system",
    apiKey: args.apiKey,
    request: {
      system: SYSTEM_PROMPT,
      max_tokens: 1200,
      temperature: 0.2,
      messages: [{ role: "user", content: userPrompt }],
    },
    models: [
      { name: "claude-haiku-4-5-20251001", maxTokens: 1200 },
      { name: "claude-haiku-4-5-20251001", maxTokens: 1200 },
    ],
    agentName: "InterviewValidate",
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

  let parsed: { findings?: unknown };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.warn(
      "[validate-interview-response] Failed to parse model output, returning empty findings",
    );
    return ok({ findings: [] });
  }

  if (!Array.isArray(parsed?.findings)) {
    return ok({ findings: [] });
  }

  const findings: ValidationFinding[] = parsed.findings
    .slice(0, MAX_FINDINGS)
    .map((raw: unknown) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const message =
        typeof r.message === "string" ? truncate(r.message.trim(), 500) : "";
      if (!message) return null;
      const questionId =
        typeof r.questionId === "string" && r.questionId.trim().length > 0
          ? r.questionId.trim()
          : null;
      const suggestedFix =
        typeof r.suggestedFix === "string" && r.suggestedFix.trim().length > 0
          ? truncate(r.suggestedFix.trim(), 300)
          : undefined;
      const finding: ValidationFinding = {
        questionId,
        severity: coerceSeverity(r.severity),
        message,
      };
      if (suggestedFix) finding.suggestedFix = suggestedFix;
      return finding;
    })
    .filter((f): f is ValidationFinding => f !== null);

  return ok({ findings });
}
