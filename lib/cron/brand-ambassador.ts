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
* Brand Ambassador Cron — Weekly LinkedIn draft generator + Telegram delivery
 *
 * Generates a short LinkedIn post draft for each active project via Claude Haiku,
 * then sends it to the configured Telegram chat for CEO approval before posting.
 *
 * Idempotent: one delivery per (projectKey, isoWeek, year). Retries are safe.
 *
 * Called by: /api/cron/brand-ambassador (weekly: 0 8 * * 1)
 *
 * Env vars required:
 *   ANTHROPIC_API_KEY     — Claude Haiku for draft generation
 *   TELEGRAM_BOT_TOKEN    — Telegram bot token
 *   TELEGRAM_CHAT_ID      — CEO personal chat or channel ID
 */

import { getISOWeek } from "date-fns";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import type { CronJobResult } from "./runner";

// ─── Project registry ─────────────────────────────────────────────────────────
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
tagline: string;
  audience: string;
}

const ACTIVE_PROJECTS: Project[] = [
  {
    key: "restore-assist",
    name: "RestoreAssist",
    tagline: "IICRC-compliant water damage restoration platform",
    audience:
      "restoration contractors, insurance assessors, property managers in Australia",
  },
  {
    key: "disaster-recovery",
    name: "Disaster Recovery Network",
    tagline: "Connecting Australians to vetted disaster recovery contractors",
    audience: "homeowners, body corporates, SMEs affected by weather events",
  },
];

// ─── Draft generation ─────────────────────────────────────────────────────────

async function generatePostDraft(
  project: Project,
  isoWeek: number,
  year: number,
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Write a short LinkedIn post for ${project.name} — ${project.tagline}.

Audience: ${project.audience}
Week: ISO week ${isoWeek}, ${year}

Rules:
- 2–3 short paragraphs, plain English, no jargon
- End with a subtle call to action (no hard sell)
- No hashtags in the body — add 3 relevant hashtags at the end on one line
- Under 250 words total
- Do NOT mention specific prices or promises

Write only the post text, ready to copy-paste into LinkedIn.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  return text.trim();
}

// ─── Telegram delivery ────────────────────────────────────────────────────────
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
isoWeek: number,
  year: number,
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn(
      "[brand-ambassador] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping delivery",
    );
    return;
  }

  const message =
    `📝 *${project.name}* — Week ${isoWeek}/${year} draft\n\n` +
    `${draft}\n\n` +
    `_Approve or edit before posting to LinkedIn._`;

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Telegram API error ${res.status}: ${body.slice(0, 200)}`,
    );
  }
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runBrandAmbassador(): Promise<CronJobResult> {
  const now = new Date();
  const isoWeek = getISOWeek(now);
  const year = now.getFullYear();

  let delivered = 0;
  let skipped = 0;
  let failed = 0;

  for (const project of ACTIVE_PROJECTS) {
    try {
      // ── Idempotency guard ──────────────────────────────────────────────────
      const alreadySent = await prisma.brandAmbassadorPost.findUnique({
        where: {
          projectKey_isoWeek_year: {
            projectKey: project.key,
            isoWeek,
            year,
          },
        },
      });

      if (alreadySent) {
        console.log(
          `[brand-ambassador] Already sent for ${project.key} week ${isoWeek}/${year} — skipping`,
        );
        skipped++;
        continue;
      }

      // ── Generate draft ─────────────────────────────────────────────────────
      console.log(
        `[brand-ambassador] Generating draft for ${project.key} week ${isoWeek}/${year}`,
      );
      const draft = await generatePostDraft(project, isoWeek, year);

      // ── Deliver to Telegram ────────────────────────────────────────────────
      await deliverDraftForApproval(project, draft, isoWeek, year);

      // ── Record delivery (prevents re-sends on cron retry) ─────────────────
      await prisma.brandAmbassadorPost.create({
        data: {
          projectKey: project.key,
          isoWeek,
          year,
          draft,
        },
      });

      delivered++;
      console.log(
        `[brand-ambassador] Delivered draft for ${project.key} week ${isoWeek}/${year}`,
      );
    } catch (err) {
      failed++;
      console.error(
        `[brand-ambassador] Failed for project ${project.key}:`,
        err,
      );
      // Continue to next project — partial delivery is acceptable
    }
  }

  return {
    itemsProcessed: delivered,
    metadata: {
      isoWeek,
      year,
      delivered,
      skipped,
      failed,
      total: ACTIVE_PROJECTS.length,
    },  };
}
