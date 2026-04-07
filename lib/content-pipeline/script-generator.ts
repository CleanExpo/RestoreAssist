/**
 * Script Generator — Pure AI function for content script generation
 *
 * Extracted from app/api/content/generate-script/route.ts.
 * No session auth, no Prisma — pure Claude API call.
 *
 * @module lib/content-pipeline/script-generator
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface ScriptData {
  hook: string;
  agitation: string;
  solution: string;
  cta: string;
  voiceoverText: string;
  caption: string;
  hashtags: string[];
}

export type Platform =
  | "tiktok"
  | "instagram"
  | "facebook"
  | "pinterest"
  | "youtube";

export interface ScriptGeneratorInput {
  product: string;
  angle: string;
  platform: Platform | string;
  duration: number;
}

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
  youtube:
    "YouTube — longer-form educational content, SEO-optimised title and description, professional authority, thumbnail-worthy hook",
};

// ─── SYSTEM PROMPT ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a world-class content strategist and copywriter specialising in the Australian water damage restoration and property recovery industry. You create high-converting social media scripts for RestoreAssist — a professional-grade inspection, reporting, and compliance platform used by IICRC-certified restoration contractors.

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

// ─── USER PROMPT ────────────────────────────────────────────────────────────

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

// ─── JSON EXTRACTOR ─────────────────────────────────────────────────────────

function extractJSON(text: string): Record<string, unknown> {
  // Strip any accidental markdown code fences
  const stripped = text
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  return JSON.parse(stripped);
}

// ─── MAIN FUNCTION ──────────────────────────────────────────────────────────

/**
 * Generate a content script via Claude API.
 *
 * Pure function — no auth, no database access.
 * Throws on API error or unparseable response.
 */
export async function generateScript(
  input: ScriptGeneratorInput,
): Promise<ScriptData> {
  const { product, angle, platform, duration } = input;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let fullText = "";

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(product, angle, platform, duration),
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

  // Parse the JSON response
  let parsed: Record<string, unknown>;
  try {
    parsed = extractJSON(fullText);
  } catch {
    throw new Error(
      `Failed to parse Claude response as JSON. Raw text: ${fullText.slice(0, 500)}`,
    );
  }

  // Validate and coerce into ScriptData
  const scriptData: ScriptData = {
    hook: typeof parsed.hook === "string" ? parsed.hook : "",
    agitation: typeof parsed.agitation === "string" ? parsed.agitation : "",
    solution: typeof parsed.solution === "string" ? parsed.solution : "",
    cta: typeof parsed.cta === "string" ? parsed.cta : "",
    voiceoverText:
      typeof parsed.voiceoverText === "string" ? parsed.voiceoverText : "",
    caption: typeof parsed.caption === "string" ? parsed.caption : "",
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags.filter((h): h is string => typeof h === "string")
      : [],
  };

  return scriptData;
}
