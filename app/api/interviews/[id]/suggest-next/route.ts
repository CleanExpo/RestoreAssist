import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/ai-provider";
import { applyRateLimit } from "@/lib/rate-limiter";
import { tryClaudeModels } from "@/lib/anthropic-models";

/**
 * RA-1199 — POST /api/interviews/[id]/suggest-next
 *
 * Uses Claude Haiku to propose ONE targeted follow-up question based on the
 * interview's answered questions, avoiding duplicates of remaining template
 * questions. Returns `{ question, reasoning }` or `{ question: null, reason }`
 * when nothing meaningful is left to ask.
 *
 * Guards:
 *  - getServerSession (Rule 1)
 *  - Subscription allowlist TRIAL/ACTIVE/LIFETIME (Rule 8)
 *  - Rate limit 30/min/user (Rule 10)
 *  - Requires 3+ answered questions (ticket requirement)
 *  - getAnthropicApiKey for BYOK cost gate
 */

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
const MIN_ANSWERS_REQUIRED = 3;
const MAX_INPUT_ANSWERS = 40;
const MAX_INPUT_REMAINING = 40;
const MAX_FIELD_CHARS = 500;

interface AnsweredQuestionInput {
  questionText: string;
  answer: unknown;
}

interface RemainingQuestionInput {
  questionText: string;
}

interface SuggestRequestBody {
  answeredQuestions?: AnsweredQuestionInput[];
  remainingQuestions?: RemainingQuestionInput[];
}

type SuggestResponse =
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
    maxRequests: 30,
    prefix: "interview-suggest-next",
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

    // Parse body
    let body: SuggestRequestBody;
    try {
      body = (await request.json()) as SuggestRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const answered = Array.isArray(body.answeredQuestions)
      ? body.answeredQuestions.slice(-MAX_INPUT_ANSWERS)
      : [];
    const remaining = Array.isArray(body.remainingQuestions)
      ? body.remainingQuestions.slice(0, MAX_INPUT_REMAINING)
      : [];

    if (answered.length < MIN_ANSWERS_REQUIRED) {
      return NextResponse.json(
        {
          error: `Need at least ${MIN_ANSWERS_REQUIRED} answered questions before requesting a suggestion`,
        },
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
      .map(
        (qa, i) =>
          `${i + 1}. Q: ${truncate(qa.questionText ?? "")}\n   A: ${formatAnswerForPrompt(qa.answer)}`,
      )
      .join("\n");

    const remainingBlock =
      remaining.length > 0
        ? remaining
            .map((q, i) => `${i + 1}. ${truncate(q.questionText ?? "")}`)
            .join("\n")
        : "(none)";

    const systemPrompt = `You are assisting an Australian water-damage restoration technician during a guided inspection interview.

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

    const userPrompt = `Prior answered questions:
${answeredBlock}

Remaining template questions (do not duplicate):
${remainingBlock}

Propose ONE follow-up question, or null if all covered.`;

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    // Haiku-first for low latency and cost on this lightweight suggestion.
    const message = await tryClaudeModels(
      anthropic,
      {
        system: systemPrompt,
        max_tokens: 250,
        temperature: 0.4,
        messages: [{ role: "user", content: userPrompt }],
      },
      [
        { name: "claude-haiku-4-5-20251001", maxTokens: 250 },
        { name: "claude-3-5-haiku-20241022", maxTokens: 250 },
      ],
      { agentName: "InterviewSuggestNext" },
    );

    const responseText =
      message.content[0]?.type === "text" ? message.content[0].text.trim() : "";

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
      const fallback: SuggestResponse = {
        question: null,
        reason: "all covered",
      };
      return NextResponse.json(fallback);
    }

    if (!parsed || typeof parsed !== "object") {
      const fallback: SuggestResponse = {
        question: null,
        reason: "all covered",
      };
      return NextResponse.json(fallback);
    }

    const question =
      typeof parsed.question === "string" && parsed.question.trim().length > 0
        ? parsed.question.trim()
        : null;
    const reasoning =
      typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : "";

    const payload: SuggestResponse = question
      ? { question, reasoning: reasoning || "Follow-up based on prior answers" }
      : { question: null, reason: reasoning || "all covered" };

    return NextResponse.json(payload);
  } catch (error) {
    // RA-786: never leak error.message
    console.error("[suggest-next] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
