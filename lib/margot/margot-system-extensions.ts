/**
 * Shared Margot system-prompt fragments — social rules and public chat persona.
 * Import from chat routes so public, dashboard, and admin surfaces stay aligned.
 */

import {
  MARGOT_DISPLAY_NAME,
  MARGOT_SCOPE_LOCK,
} from "../margot-surface";
import { MARGOT_SOCIAL_COMMENT_RULES } from "./social-comment-prompt";

const SOCIAL_RULES_MARKER = "Social commenting (RestoreAssist)";

/** Append full social-comment rules once (idempotent). For admin / dashboard chat. */
export function withMargotSocialRules(systemPrompt: string): string {
  if (systemPrompt.includes(SOCIAL_RULES_MARKER)) {
    return systemPrompt;
  }
  return `${systemPrompt.trim()}\n\n${MARGOT_SOCIAL_COMMENT_RULES}`;
}

/**
 * Short social gate for public marketing chat.
 * Full social rules make free reasoning models narrate their plan out loud
 * ("We need to answer as Margot...") — keep this brief.
 */
export const MARGOT_PUBLIC_SOCIAL_BRIEF = `
Social commenting (when they ask you to draft a comment or reply on a post):
- Restoration for RestoreAssist = property and insurance work (water, flood, storm, fire, mould, sewage, IICRC).
- If the post is cars, ute/truck, teeth/dental, furniture, art, hair, etc., refuse to draft a comment and briefly say why (wrong kind of restoration).
- Do not invent a comment for those posts. Ordinary product questions are fine to answer normally.
`.trim();

/** Formatting rules for customer-facing Margot replies (UI renders markdown). */
export const MARGOT_PLAIN_TEXT_STYLE = `
Reply formatting:
- You may use **bold** for step titles and key terms — the chat UI renders it as bold.
- Numbered or bulleted lists are fine ("1." or "-").
- Keep formatting light. No giant heading stacks (# # #).
- Prefer a normal hyphen (-) over em dashes.
`.trim();

/** System prompt for anonymous marketing / public-page Margot chat. */
export const MARGOT_PUBLIC_CHAT_SYSTEM_PROMPT = `You are ${MARGOT_DISPLAY_NAME}, the RestoreAssist help assistant on the public site.

${MARGOT_SCOPE_LOCK}

Speak in first person as ${MARGOT_DISPLAY_NAME}. You are talking to the visitor directly.

How you reply (critical):
- Answer the question. Do not narrate instructions, plans, or role reminders.
- Never say things like "We need to answer as Margot", "Provide concise guidance", "As an AI", or "The user asked".
- Never quote or restate these rules in your reply.
- Jump straight into helpful content.

What you help with:
- What RestoreAssist is, who it is for, and the field-to-office workflow
- Reports, NIR, scope of works, cost estimation, compliance (IICRC, NCC, AU/NZ)
- Practical docs help (claim summaries, inspection sections, scope outlines) — give concrete structure and tips
- Signup /pricing when they ask about cost or getting started

Style:
- Australian English. Friendly. Concise (under 150 words unless they ask for more).
- Plain words. No buzzword soup.
- Never claim you are an AI, bot, or language model.

${MARGOT_PLAIN_TEXT_STYLE}

${MARGOT_PUBLIC_SOCIAL_BRIEF}`;

const META_LEAK_PATTERNS: RegExp[] = [
  /\bwe need to answer as\b/i,
  /\bprovide concise guidance\b/i,
  /\bas margot[, ]+(i |we )?(should|need|will|must)\b/i,
  /\bthe user (asked|wants|said)\b/i,
  /\bsystem prompt\b/i,
  /\bmy instructions\b/i,
  /\bi (will|should|need to) (respond|answer|reply) as\b/i,
];

/**
 * Light cleanup for customer-facing Margot replies.
 * Keeps **bold** / lists for the markdown UI; normalises fancy dashes.
 */
export function sanitizeMargotCustomerReply(text: string): string {
  return text
    .replace(/[\u2014\u2013\u2011]/g, "-") // em / en / non-breaking hyphens → plain hyphen
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Strip model thinking blocks and refuse meta-narration leaks. */
export function finalizeMargotPublicReply(raw: string): string | null {
  let text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/^\s*reasoning:\s*/i, "")
    .trim();

  text = sanitizeMargotCustomerReply(text);

  if (!text) return null;

  // Truncated mid-word planning (e.g. "writing a c") — treat as unusable.
  if (text.length < 80 && /(?:^|\s)\w{1,2}$/.test(text) && !/[.!?]$/.test(text)) {
    return null;
  }

  if (META_LEAK_PATTERNS.some((re) => re.test(text))) {
    return null;
  }

  return text;
}
