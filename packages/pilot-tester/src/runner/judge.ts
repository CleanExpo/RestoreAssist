/**
 * LLM-as-judge grader.
 *
 * Third grading dimension from the original plan. The deterministic
 * scorer catches structural problems (missing sections, hedging
 * words, equipment ratios). The adjuster persona catches operational
 * problems (cost reasonableness, compliance gaps). Neither catches
 * "the prose reads like an undergraduate wrote it" — that's the gap
 * this fills.
 *
 * Prompt is intentionally narrow: 4 numeric scores 0–10 against
 * known-bad failure modes. No free-form feedback, no creative
 * requests — every dimension has a hard definition the model can
 * anchor against, which keeps inter-run variance low.
 *
 * Cost: ~$0.001 per assessment at Haiku pricing. Skipped if
 * ANTHROPIC_API_KEY is not set.
 */

import type { GenerateAssessmentOutput } from "../client/api-client.js";

const JUDGE_MODEL = "claude-haiku-4-5-20251001";

const JUDGE_SYSTEM_PROMPT = `You are an experienced restoration-industry editor reviewing an automated assessment report. Your job is to grade the report on four dimensions, each on a 0–10 integer scale. Output ONLY a JSON object — no prose, no code fences.

Schema (strict):
{
  "professionalism": integer 0-10,
  "specificity": integer 0-10,
  "consistency": integer 0-10,
  "actionability": integer 0-10,
  "rationale": string (60-200 chars total across all dimensions)
}

Definitions:

PROFESSIONALISM (0-10): Would an Australian insurance adjuster accept this as polished, native-quality professional writing? Penalise: hedging ("might", "could possibly"), filler ("it should be noted", "as previously discussed"), American spelling, ChatGPT-style throat-clearing intros, generic templated sentences without specific job content. 10 = reads like a senior tech wrote it on the job; 0 = obvious AI slop.

SPECIFICITY (0-10): Does the report ground every claim in the inspection's actual numbers (square metres, moisture readings, time-since-loss, equipment counts) or does it speak in generalities? 10 = every section cites at least one specific number from the input; 0 = could apply to any water-damage job.

CONSISTENCY (0-10): Does the report contradict itself across sections? Penalise: scope items not justified anywhere in the report body, citations in the body that don't appear in the citations array, equipment mentioned in the report but absent from the scope, water-category disagreement between sections. 10 = every cross-reference holds; 0 = sections clearly written by different processes.

ACTIONABILITY (0-10): Could a restoration tech read this report and start work without further clarification? Penalise: missing equipment quantities, missing duration estimates, ambiguous responsibility ("contractor or homeowner to confirm"), missing contingency plans. 10 = full work plan; 0 = aspirational summary only.

Reasoning rules:
- Australian English ("metres", "colour", "organisation").
- Never reward verbosity — a tight, specific report scores higher than a long generic one.
- The rationale field is for *your* notes, not for the model's chain-of-thought. 1-2 short clauses per dimension.

Return ONLY the JSON object.`;

export interface JudgeScore {
  professionalism: number;
  specificity: number;
  consistency: number;
  actionability: number;
  composite: number; // mean of the 4, scaled to 0-100
  rationale: string;
  modelUsed: string;
  costUsd: number | null;
  latencyMs: number;
}

export interface JudgeOptions {
  generated: GenerateAssessmentOutput;
  apiKey?: string;
}

/**
 * Run the judge against one assessment. Returns null if the API key
 * is missing or the model output can't be parsed — never throws.
 */
export async function judgeAssessment(
  opts: JudgeOptions,
): Promise<JudgeScore | null> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  let Anthropic: typeof import("@anthropic-ai/sdk").default;
  try {
    const mod = await import("@anthropic-ai/sdk");
    Anthropic = mod.default;
  } catch {
    return null;
  }

  const client = new Anthropic({ apiKey });
  const start = Date.now();

  const reportText = stitchReport(opts.generated);

  let response;
  try {
    response = await client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 400,
      system: JUDGE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Grade this assessment report. Domain: ${opts.generated.meta.domain}.\n\nReport:\n\n${reportText}`,
        },
      ],
    });
  } catch {
    return null;
  }
  const latencyMs = Date.now() - start;

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: {
    professionalism?: unknown;
    specificity?: unknown;
    consistency?: unknown;
    actionability?: unknown;
    rationale?: unknown;
  };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  const dims = [
    "professionalism",
    "specificity",
    "consistency",
    "actionability",
  ] as const;
  const scores: number[] = [];
  for (const k of dims) {
    const v = parsed[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 10) {
      return null;
    }
    scores.push(Math.round(v));
  }

  // Haiku 4.5 pricing (Apr 2026 reference): $1/MTok in, $5/MTok out.
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const costUsd =
    (inputTokens / 1_000_000) * 1 + (outputTokens / 1_000_000) * 5;

  const [prof, spec, cons, act] = scores;
  const composite = ((prof + spec + cons + act) / 4) * 10; // → 0-100

  return {
    professionalism: prof,
    specificity: spec,
    consistency: cons,
    actionability: act,
    composite,
    rationale:
      typeof parsed.rationale === "string"
        ? parsed.rationale.slice(0, 240)
        : "",
    modelUsed: JUDGE_MODEL,
    costUsd,
    latencyMs,
  };
}

function stitchReport(generated: GenerateAssessmentOutput): string {
  const sections = generated.report.sections
    .map(
      (s) =>
        `## ${s.heading}\n${s.body}${
          s.citations && s.citations.length > 0
            ? "\nCitations: " +
              s.citations.map((c) => `${c.standard} ${c.section}`).join(", ")
            : ""
        }`,
    )
    .join("\n\n");
  const scope = generated.scope.items
    .map(
      (i) =>
        `- ${i.description} (qty ${i.quantity} ${i.unit}${i.iicrcRef ? ", ref " + i.iicrcRef : ""})`,
    )
    .join("\n");
  const totals = generated.estimate.totals;
  return `${sections}\n\n## Scope items\n${scope}\n\n## Estimate totals (AUD)\nex GST: $${totals.subtotalExGst.toFixed(2)} | GST: $${totals.gstTotal.toFixed(2)} | inc GST: $${totals.totalIncGst.toFixed(2)}`;
}
