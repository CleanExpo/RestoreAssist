/**
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
    },
  };
}
