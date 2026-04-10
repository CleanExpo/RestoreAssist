/**
 * POST /api/content/generate-script
 *
 * Stage 1 of the content automation pipeline (RA-158).
 * Calls Claude API to generate a brand-voiced, IICRC-restoration-expert script
 * for the given product, angle, platform, and duration.
 *
 * Authentication: session required
 *
 * Request body:
 *   {
 *     product:  string   // e.g. "RestoreAssist Pro"
 *     angle:    string   // e.g. "social proof", "problem/solution"
 *     platform: string   // 'tiktok' | 'instagram' | 'facebook' | 'pinterest'
 *     duration: number   // 15 | 30 | 60
 *     jobId?:   string   // Existing ContentJob to update instead of creating new
 *   }
 *
 * Response 200:
 *   ContentJob with hook, agitation, solution, cta, voiceoverText, caption, hashtags
 *   and status === 'SCRIPT_READY'
 *
 * Response 400: missing/invalid fields
 * Response 401: not authenticated
 * Response 500: Claude API or DB error
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── PLATFORM GUIDANCE ──────────────────────────────────────────────────────

const PLATFORM_CONTEXT: Record<string, string> = {
  tiktok:
    "TikTok short-form video — fast cuts, trending audio, Gen-Z/Millennial tone, 3-second hook",
  instagram:
    "Instagram Reels/Feed — polished but authentic, hashtag-rich caption, lifestyle aspirational",
  facebook:
    "Facebook — slightly longer copy acceptable, trust-focused, community tone, broad demographic",
  pinterest:
    "Pinterest — aspirational, keyword-optimised description, link to resource, helpful tone",
};

// ─── SYSTEM PROMPT ───────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a world-class content strategist and copywriter specialising in the Australian water damage restoration and property recovery industry. You create high-converting social media scripts for RestoreAssist — a professional-grade inspection, reporting, and compliance platform used by IICRC-certified restoration contractors.

Brand voice guidelines:
- Authoritative yet approachable — you speak as a trusted restoration expert, not a salesperson
- Technically credible — reference IICRC S500, AS/NZS standards where relevant
- Australian English spelling and idioms (e.g. "labour", "programme", "organisation")
- Empathetic to property owners experiencing stress; confident with B2B/contractor audiences
- Never fear-monger; always solution-focused

Platform-specific best practices are provided in the user message.

You MUST respond with a single JSON object — no markdown, no preamble, no explanation — matching this exact structure:
{
  "hook": "string — opening 1-2 sentences that stop the scroll (max 25 words)",
  "agitation": "string — briefly amplify the pain point (max 40 words)",
  "solution": "string — how RestoreAssist solves it (max 60 words)",
  "cta": "string — clear call to action (max 15 words)",
  "voiceoverText": "string — full narration script optimised for the given duration in seconds",
  "caption": "string — platform-optimised post caption (includes relevant emojis)",
  "hashtags": ["array", "of", "hashtag", "strings", "without", "the", "hash"]
}`;
}

// ─── USER PROMPT ─────────────────────────────────────────────────────────────

function buildUserPrompt(
  product: string,
  angle: string,
  platform: string,
  duration: number,
): string {
  const platformCtx = PLATFORM_CONTEXT[platform] ?? platform;

  return `Generate a ${duration}-second ${platform} content script for the following:

Product/Feature: ${product}
Angle/Theme: ${angle}
Platform context: ${platformCtx}

The voiceoverText must be naturally speakable in exactly ${duration} seconds at a comfortable conversational pace (roughly ${Math.round(duration * 2.5)} words).

Return only the JSON object.`;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function extractJSON(text: string): Record<string, unknown> {
  // Strip any accidental markdown code fences
  const stripped = text
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  return JSON.parse(stripped);
}

// ─── POST ─────────────────────────────────────────────────────────────────────

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, subscriptionStatus: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!ALLOWED_SUBSCRIPTION_STATUSES.includes(user.subscriptionStatus ?? "")) {
    return NextResponse.json(
      { error: "Active subscription required" },
      { status: 402 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { product, angle, platform, duration, jobId } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (!product || typeof product !== "string") {
    return NextResponse.json({ error: "product is required" }, { status: 400 });
  }
  if (!angle || typeof angle !== "string") {
    return NextResponse.json({ error: "angle is required" }, { status: 400 });
  }
  if (!platform || typeof platform !== "string") {
    return NextResponse.json(
      { error: "platform is required" },
      { status: 400 },
    );
  }
  if (
    !duration ||
    typeof duration !== "number" ||
    ![15, 30, 60].includes(duration)
  ) {
    return NextResponse.json(
      { error: "duration must be 15, 30, or 60" },
      { status: 400 },
    );
  }

  try {
    // ── 1. Create or fetch the ContentJob ──────────────────────────────────
    let job = jobId
      ? await prisma.contentJob.findFirst({
          where: { id: jobId as string, userId: session.user.id },
        })
      : null;

    if (jobId && !job) {
      return NextResponse.json(
        { error: "ContentJob not found or not owned by user" },
        { status: 404 },
      );
    }

    if (!job) {
      job = await prisma.contentJob.create({
        data: {
          userId: session.user.id,
          product: product as string,
          angle: angle as string,
          platform: platform as string,
          duration: duration as number,
          status: "PENDING",
        },
      });
    }

    // ── 2. Call Claude API with streaming ──────────────────────────────────
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let fullText = "";

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: buildUserPrompt(
            product as string,
            angle as string,
            platform as string,
            duration as number,
          ),
        },
      ],
    });

    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        fullText += chunk.delta.text;
      }
    }

    // ── 3. Parse JSON from model response ─────────────────────────────────
    let scriptData: Record<string, unknown>;
    try {
      scriptData = extractJSON(fullText);
    } catch {
      console.error(
        "[generate-script] Failed to parse Claude response:",
        fullText,
      );
      await prisma.contentJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorMessage: "Claude response was not valid JSON",
        },
      });
      return NextResponse.json(
        { error: "Failed to parse script from Claude response" },
        { status: 500 },
      );
    }

    // ── 4. Persist script to ContentJob ───────────────────────────────────
    const hashtags = Array.isArray(scriptData.hashtags)
      ? JSON.stringify(scriptData.hashtags)
      : typeof scriptData.hashtags === "string"
        ? scriptData.hashtags
        : null;

    const updatedJob = await prisma.contentJob.update({
      where: { id: job.id },
      data: {
        hook: typeof scriptData.hook === "string" ? scriptData.hook : null,
        agitation:
          typeof scriptData.agitation === "string"
            ? scriptData.agitation
            : null,
        solution:
          typeof scriptData.solution === "string" ? scriptData.solution : null,
        cta: typeof scriptData.cta === "string" ? scriptData.cta : null,
        voiceoverText:
          typeof scriptData.voiceoverText === "string"
            ? scriptData.voiceoverText
            : null,
        caption:
          typeof scriptData.caption === "string" ? scriptData.caption : null,
        hashtags,
        status: "SCRIPT_READY",
      },
    });

    return NextResponse.json(updatedJob, { status: 200 });
  } catch (err) {
    console.error("[generate-script] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
