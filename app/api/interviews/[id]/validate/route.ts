import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/ai-provider";
import { applyRateLimit } from "@/lib/rate-limiter";
import { tryClaudeModels } from "@/lib/anthropic-models";

/**
 * RA-1214 — POST /api/interviews/[id]/validate
 *
 * Uses Claude Haiku to validate a guided interview's answers against
 * IICRC S500:2025 water-damage restoration standards. Returns an
 * advisory-only finding list — does NOT block report generation.
 *
 * Guards:
 *  - getServerSession (Rule 1)
 *  - Subscription allowlist TRIAL/ACTIVE/LIFETIME (Rule 8)
 *  - Rate limit 10/min/user (Rule 10)
 *  - getAnthropicApiKey for BYOK cost gate
 */

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
const MAX_INPUT_ANSWERS = 60;
const MAX_FIELD_CHARS = 600;
const MAX_FINDINGS = 20;

interface AnsweredQuestionInput {
  questionId?: string;
  questionText?: string;
  answer?: unknown;
}

interface ValidateRequestBody {
  answeredQuestions?: AnsweredQuestionInput[];
}

export interface ValidationFinding {
  questionId: string | null;
  severity: "warn" | "error";
  message: string;
  suggestedFix?: string;
}

export interface ValidationResponse {
  findings: ValidationFinding[];
  validatedAt: string;
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 10,
    prefix: "interview-validate",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Interview ID is required" },
        { status: 400 },
      );
    }

    let body: ValidateRequestBody;
    try {
      body = (await request.json()) as ValidateRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const answered = Array.isArray(body.answeredQuestions)
      ? body.answeredQuestions.slice(0, MAX_INPUT_ANSWERS)
      : [];

    if (answered.length === 0) {
      return NextResponse.json(
        { error: "No answered questions provided" },
        { status: 400 },
      );
    }

    // Verify session ownership + subscription
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, subscriptionStatus: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(user.subscriptionStatus ?? "")
    ) {
      return NextResponse.json(
        { error: "Active subscription required" },
        { status: 402 },
      );
    }

    const interviewSession = await prisma.interviewSession.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!interviewSession) {
      return NextResponse.json(
        { error: "Interview session not found" },
        { status: 404 },
      );
    }

    // Resolve API key (env or BYOK)
    let anthropicApiKey: string;
    try {
      anthropicApiKey = await getAnthropicApiKey(userId);
    } catch {
      return NextResponse.json(
        { error: "Failed to get Anthropic API key" },
        { status: 400 },
      );
    }

    const answeredBlock = answered
      .map((qa, i) => {
        const qid =
          typeof qa.questionId === "string" ? qa.questionId : `q${i + 1}`;
        const qtext =
          typeof qa.questionText === "string" ? qa.questionText : "";
        return `${i + 1}. [id=${qid}] Q: ${truncate(qtext)}\n   A: ${formatAnswerForPrompt(qa.answer)}`;
      })
      .join("\n");

    const systemPrompt = `You are an IICRC S500:2025 compliance reviewer for Australian water-damage restoration inspections.

Your job: read the technician's answers from a guided inspection interview and flag anything that is inconsistent, missing, or non-compliant against IICRC S500:2025.

Strict rules:
- Australian English (e.g. "mould" not "mold"; "colour" not "color"; "category" not "class" for contamination).
- Only flag issues you are confident about. An empty findings list is correct and expected when answers are clean.
- Every message MUST cite a specific IICRC S500:2025 section in the form "S500:2025 §X.Y" (e.g. "S500:2025 §6.3", "S500:2025 §10.6.4"). Never abbreviate, never omit the year, never cite other standards you invent.
- Use severity "error" ONLY for direct contradictions with S500:2025 (e.g. Category 3 water treated as Category 1, missing PPE on Cat 3, drying timeframes clearly outside standard).
- Use severity "warn" for likely gaps, ambiguous answers, or compliance risks that a reviewer would query.
- Keep each message to 1–2 sentences. If a fix is obvious, include a short "suggestedFix".
- questionId must match the bracketed id from the input (e.g. q1, cmabc123); if a finding is not tied to one question, use null.
- Do NOT invent IICRC sections you are not certain about. If unsure of the exact section, omit that finding.
- Do NOT comment on spelling, grammar, or answer formatting — only on compliance substance.

Respond with ONLY a JSON object, no prose, no markdown fences:
{"findings": [{"questionId": "<id or null>", "severity": "warn"|"error", "message": "<text citing S500:2025 §X.Y>", "suggestedFix": "<optional short fix>"}]}

If everything looks clean, respond exactly:
{"findings": []}`;

    const userPrompt = `Answered interview questions:
${answeredBlock}

Validate these answers against IICRC S500:2025 and return findings.`;

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const message = await tryClaudeModels(
      anthropic,
      {
        system: systemPrompt,
        max_tokens: 1200,
        temperature: 0.2,
        messages: [{ role: "user", content: userPrompt }],
      },
      [
        { name: "claude-haiku-4-5-20251001", maxTokens: 1200 },
        { name: "claude-3-5-haiku-20241022", maxTokens: 1200 },
      ],
      { agentName: "InterviewValidate" },
    );

    const responseText =
      message.content[0]?.type === "text" ? message.content[0].text.trim() : "";

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : responseText;

    let parsed: { findings?: unknown };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.warn(
        "[interview-validate] Failed to parse model output, returning empty findings",
      );
      const payload: ValidationResponse = {
        findings: [],
        validatedAt: new Date().toISOString(),
      };
      return NextResponse.json(payload);
    }

    const rawFindings = Array.isArray(parsed?.findings) ? parsed.findings : [];
    const findings: ValidationFinding[] = rawFindings
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

    const payload: ValidationResponse = {
      findings,
      validatedAt: new Date().toISOString(),
    };
    return NextResponse.json(payload);
  } catch (error) {
    // RA-786: never leak error.message
    console.error("[interview-validate] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
