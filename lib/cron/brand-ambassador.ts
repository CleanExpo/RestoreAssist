/**
 * brand-ambassador.ts — Weekly social content generation (RA-693)
 *
 * For each active portfolio project, generates a draft social media post
 * using Claude Haiku and delivers it to Telegram for Phill's review.
 * Posts are NOT published automatically — Telegram approval is required.
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY       — content generation model
 *   TELEGRAM_BOT_TOKEN      — delivery channel
 *   TELEGRAM_CHAT_ID        — Phill's chat or approval channel
 *
 * Schedule: weekly (Sunday 18:00 AEST)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { CronJobResult } from "./runner";

// ── Active projects ──────────────────────────────────────────────────────────

interface Project {
  key: string;
  name: string;
  audience: string;
  tone: string;
  recentFocus: string;
}

// Maintained here — update when projects go active or inactive.
const ACTIVE_PROJECTS: Project[] = [
  {
    key: "restoreassist",
    name: "RestoreAssist",
    audience:
      "Australian water damage restoration professionals and insurance assessors",
    tone: "professional, compliance-aware, practically focused",
    recentFocus:
      "IICRC S500:2025 compliance, AI-assisted moisture mapping, scope-of-works automation",
  },
  {
    key: "synthex",
    name: "Synthex",
    audience: "AI-first development teams and technical founders",
    tone: "technical, forward-looking, builder-focused",
    recentFocus:
      "AI agent pipelines, autonomous code generation, quality gates",
  },
  {
    key: "dr-nrpg",
    name: "Disaster Recovery NRPG",
    audience: "Insurance and emergency response professionals",
    tone: "authoritative, solution-oriented, industry-expert",
    recentFocus: "Claims processing automation, field assessment tools",
  },
];

// ── Content generation ────────────────────────────────────────────────────────

async function generatePostDraft(project: Project): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });

  const prompt = `You are a social media content writer for ${project.name}.

Audience: ${project.audience}
Tone: ${project.tone}
Recent focus: ${project.recentFocus}

Write ONE LinkedIn post draft. Requirements:
- 150–250 words
- Opens with a hook that will stop scrolling
- Shares one specific, actionable insight relevant to the recent focus
- Ends with a clear call to action or question that invites engagement
- Do NOT use hashtags — they will be added at review
- Do NOT use em-dashes or excessive punctuation
- No "Exciting news!" type openers

Return only the post text, no title or commentary.`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].type === "text"
    ? message.content[0].text.trim()
    : "";
}

// ── Telegram delivery ─────────────────────────────────────────────────────────

async function deliverDraftForApproval(
  project: Project,
  draft: string,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const text =
    `📝 *Weekly Draft — ${project.name}*\n\n` +
    `${draft}\n\n` +
    `---\n` +
    `Reply with edits or ✅ to approve for scheduling.`;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateBrandAmbassadorDrafts(): Promise<CronJobResult> {
  const results: { project: string; delivered: boolean; error?: string }[] = [];

  for (const project of ACTIVE_PROJECTS) {
    try {
      const draft = await generatePostDraft(project);
      if (!draft) {
        results.push({
          project: project.key,
          delivered: false,
          error: "empty draft",
        });
        continue;
      }
      const delivered = await deliverDraftForApproval(project, draft);
      results.push({ project: project.key, delivered });
    } catch (err) {
      results.push({
        project: project.key,
        delivered: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const delivered = results.filter((r) => r.delivered).length;

  return {
    itemsProcessed: delivered,
    metadata: { results },
  };
}
