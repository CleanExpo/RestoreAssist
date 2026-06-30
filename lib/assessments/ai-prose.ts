/**
 * AI prose enhancement for RA-1717 assessment reports.
 *
 * Takes the rule-based ReportSection[] produced by a domain plug-in
 * and rewrites each section's `body` into investigator-grade prose
 * grounded in the existing citations and the inspection's structured
 * data. Citations are passed through verbatim — the AI is forbidden
 * from inventing standards references.
 *
 * Contract:
 * - Workspace daily AI budget is consulted *before* the call.
 * - On budget exhaustion, error, or bad model output: returns the
 *   original sections unchanged + a `degraded` flag. Pilots never
 *   get a 500 because the prose layer broke.
 * - The model receives ONLY the heading + bullet/short body + the
 *   declared citations. No PII beyond what the rule layer chose to
 *   include. No fields get added or removed.
 *
 * Cost: ~$0.001-0.005 per assessment at Claude Haiku pricing
 * (5–8 sections × ~300 input + 200 output tokens each).
 */

import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/ai-provider";
import { checkWorkspaceBudget } from "@/lib/ai/budget-guard";
import type { ReportSection, AssessmentDomain } from "./types";

const PROSE_MODEL = "claude-haiku-4-5-20251001";
// Estimate the worst-case spend per assessment generation. Used by the
// budget-guard pre-check; the real spend is recorded after the call.
const PROSE_COST_ESTIMATE_USD = 0.01;

export interface EnhanceProseArgs {
  domain: AssessmentDomain;
  sections: ReportSection[];
  /** Workspace footing the bill; null skips the budget check (legacy). */
  workspaceId: string | null;
  /** User who triggered the generation — used to fetch their BYOK key. */
  userId: string;
}

export interface EnhanceProseResult {
  sections: ReportSection[];
  /** True iff every section was successfully rewritten by the model. */
  enhanced: boolean;
  /** Reason returned to the caller when `enhanced=false`. */
  degradedReason?: string;
  /** Best-effort actual cost for usage logging; null when no call ran. */
  costUsd: number | null;
  /** Wall-clock ms for the AI call; null when no call ran. */
  latencyMs: number | null;
  modelUsed: string | null;
}

const DOMAIN_TONE: Record<AssessmentDomain, string> = {
  WATER:
    "IICRC S500:2021 water-damage restoration assessor for an Australian insurer",
  MOULD: "IICRC S520:2024 mould remediation Indoor Environmental Professional",
  BIOHAZARD: "IICRC S540:2023 trauma & biohazard remediation lead in Australia",
  FIRE_SMOKE: "IICRC S700:2025 fire & smoke damage restoration assessor",
  STORM:
    "Australian storm-damage restoration assessor (S500:2021 + NCC Vol 2 Part 3.5)",
  HVAC: "NADCA ACR 2021 + AS/NZS 3666 HVAC hygiene assessor",
  AUSTRALIAN_COMPLIANCE:
    "Australian compliance lead (WHS Act 2011, GICOP 2020, Privacy Act 1988, Fair Work Act 2009)",
};

const SYSTEM_PROMPT_BASE = `You are rewriting one section of a professional restoration-assessment report for an Australian insurer.

Hard rules:
1. Output ONLY a JSON object: {"body": "..."} — no prose, no code fences.
2. Australian English (metres, colour, organisation, programme).
3. 2–5 sentences, 60–180 words. No bullet lists in this rewrite — flowing prose only.
4. Preserve every standards reference shown in the input citations array EXACTLY (e.g. "IICRC S500:2021 §13.2"). You may quote the section number inline.
5. Never invent new standards references, certifications, postcodes, equipment models, or quantitative readings. If a number is not in the input, do not introduce one.
6. Never change the technical conclusion. If the input states "Cat 3 black water", you must not soften to "potentially contaminated".
7. Do not include cost figures unless they appear verbatim in the input body.
8. If the input body is already prose-quality and you have nothing to add, return it unchanged.`;

interface ParsedSection {
  body: string;
}

function buildUserPayload(section: ReportSection): string {
  return JSON.stringify(
    {
      heading: section.heading,
      currentBody: section.body,
      citations: (section.citations ?? []).map((c) => ({
        standard: c.standard,
        section: c.section,
        note: c.note,
      })),
    },
    null,
    2,
  );
}

function tryParseBody(raw: string): ParsedSection | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed.body === "string" && parsed.body.length > 0) {
      return { body: parsed.body };
    }
  } catch {
    // fall through
  }
  return null;
}

export async function enhanceReportProse(
  args: EnhanceProseArgs,
): Promise<EnhanceProseResult> {
  const original = args.sections;

  // 1. Budget check (skipped for legacy null workspace).
  if (args.workspaceId) {
    const budget = await checkWorkspaceBudget({
      workspaceId: args.workspaceId,
      estimatedCostUsd: PROSE_COST_ESTIMATE_USD,
    });
    if (!budget.ok) {
      return {
        sections: original,
        enhanced: false,
        degradedReason: `BUDGET_EXCEEDED: ${budget.error}`,
        costUsd: null,
        latencyMs: null,
        modelUsed: null,
      };
    }
  }

  // 2. Resolve API key (BYOK first, env fallback).
  let apiKey: string;
  try {
    apiKey = await getAnthropicApiKey(args.userId);
  } catch {
    return {
      sections: original,
      enhanced: false,
      degradedReason: "NO_API_KEY",
      costUsd: null,
      latencyMs: null,
      modelUsed: null,
    };
  }

  const client = new Anthropic({ apiKey });
  const tone = DOMAIN_TONE[args.domain] ?? "restoration assessor";
  const systemPrompt = `You are a ${tone}. ${SYSTEM_PROMPT_BASE}`;

  const start = Date.now();
  const enhanced: ReportSection[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let allOk = true;

  for (const section of original) {
    try {
      const message = await client.messages.create({
        model: PROSE_MODEL,
        max_tokens: 400,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Rewrite this report section per the rules. Input:\n\n${buildUserPayload(section)}`,
          },
        ],
      });
      totalInputTokens += message.usage.input_tokens ?? 0;
      totalOutputTokens += message.usage.output_tokens ?? 0;
      const textBlock = message.content.find((b) => b.type === "text");
      const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
      const parsed = tryParseBody(raw);
      if (parsed) {
        enhanced.push({ ...section, body: parsed.body });
      } else {
        // Fall back to original on parse failure for THIS section only;
        // continue to enhance the rest. Mark the overall result as degraded.
        enhanced.push(section);
        allOk = false;
      }
    } catch (err) {
      console.error("[ai-prose] section enhancement failed", err);
      enhanced.push(section);
      allOk = false;
    }
  }

  const latencyMs = Date.now() - start;
  // Haiku 4.5 pricing: $1/MTok input, $5/MTok output (Apr 2026 reference).
  const costUsd =
    (totalInputTokens / 1_000_000) * 1 + (totalOutputTokens / 1_000_000) * 5;

  return {
    sections: enhanced,
    enhanced: allOk,
    degradedReason: allOk ? undefined : "PARTIAL_PARSE_FAIL",
    costUsd,
    latencyMs,
    modelUsed: PROSE_MODEL,
  };
}
