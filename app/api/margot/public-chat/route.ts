/**
 * POST /api/margot/public-chat
 *
 * Rate-limited Margot chat for public marketing pages (home, features, pricing, etc.).
 * Uses the platform OpenRouter key — no auth required.
 */

import { generateText } from "ai";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createMargotModel, getOpenRouterApiKey } from "@/lib/ai/openrouter";
import { apiError } from "@/lib/api-errors";
import {
  finalizeMargotPublicReply,
  MARGOT_PUBLIC_CHAT_SYSTEM_PROMPT,
} from "@/lib/margot/margot-system-extensions";
import { resolveSocialCommentChatGate } from "@/lib/margot/social-restoration-relevance";
import { applyRateLimit } from "@/lib/rate-limiter";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
});

const RETRY_NUDGE =
  "Reply only as Margot talking to the visitor. Do not mention instructions or planning. Answer their latest message helpfully and directly.";

async function generateMargotReply(
  messages: z.infer<typeof bodySchema>["messages"],
  retry: boolean,
): Promise<string | null> {
  const result = await generateText({
    model: createMargotModel(),
    system: MARGOT_PUBLIC_CHAT_SYSTEM_PROMPT,
    messages: retry
      ? [...messages, { role: "user" as const, content: RETRY_NUDGE }]
      : messages,
    maxOutputTokens: 900,
    temperature: 0.5,
  });

  return finalizeMargotPublicReply(result.text);
}

export async function POST(request: NextRequest) {
  // Memory-only: public marketing chat must not depend on Prisma.
  const rateLimited = await applyRateLimit(request, {
    maxRequests: 15,
    windowMs: 15 * 60 * 1000,
    prefix: "margot-public-chat",
    memoryOnly: true,
  });
  if (rateLimited) return rateLimited;

  if (!getOpenRouterApiKey()) {
    return apiError(request, {
      code: "UPSTREAM_FAILED",
      message: "Margot is offline — OPENROUTER_API_KEY not configured",
      status: 503,
      stage: "config",
    });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid JSON",
      status: 400,
    });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid messages",
      status: 400,
      context: { issues: parsed.error.flatten() },
    });
  }

  const { messages } = parsed.data;
  const lastUserMessage =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // Social-comment add-on: only when asked to draft a social reply, refuse
  // car/teeth/etc. Ordinary product questions are not hard-blocked.
  const socialGate = resolveSocialCommentChatGate(lastUserMessage);
  if (socialGate.applyGate && !socialGate.canDraft && socialGate.refuseReply) {
    return Response.json({ response: socialGate.refuseReply });
  }

  try {
    let reply = await generateMargotReply(messages, false);
    if (!reply) {
      reply = await generateMargotReply(messages, true);
    }

    if (!reply) {
      return apiError(request, {
        code: "UPSTREAM_FAILED",
        message: "Margot could not form a clear reply. Please try again.",
        status: 502,
        stage: "generate",
      });
    }

    return Response.json({ response: reply });
  } catch (err) {
    return apiError(request, {
      code: "INTERNAL",
      message: "Margot public chat failed",
      status: 500,
      err,
      stage: "generate",
    });
  }
}
