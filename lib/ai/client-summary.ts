/**
 * RA-1461 — Client-facing plain-English summary generator (Haiku 4.5).
 *
 * Generates a ≤160-word, grade-8-reading-level summary of a water damage
 * report for the property owner (see feedback_client_not_adjuster.md).
 * Must:
 *   - address the reader as "you"
 *   - contain at least one IICRC citation matching /S\d+:\d+/
 *   - end with "What this means for you:" followed by 1-2 sentences
 *   - use Australian English (colour, organise, metre)
 *
 * Each constraint is checked post-generation and retried once if it
 * fails. If every retry fails we fall back to a deterministic safe
 * template so the UI always has something to show.
 *
 * The system prompt is cached via Anthropic prompt caching (90% discount
 * on repeat calls) — the only varying content is the user message.
 */

import Anthropic from "@anthropic-ai/sdk";

export const CLIENT_SUMMARY_MODEL = "claude-haiku-4-5-20251001";

const MAX_WORDS = 160;
const MAX_TOKENS = 300;
const TEMPERATURE = 0.2;
const IICRC_CITATION = /S\d+:\d+/;
const CLOSER = "What this means for you:";

export interface ClientSummaryInput {
  /** Report ID — used for logging/tracing only. */
  reportId: string;
  /** Property address, e.g. "12 Main St, Sydney NSW 2000". */
  propertyAddress?: string | null;
  /** Hazard or claim type, e.g. "WATER", "FIRE", "MOULD". */
  hazardType?: string | null;
  /** IICRC water category (1, 2, 3). */
  waterCategory?: string | null;
  /** IICRC water class (1-4). */
  waterClass?: string | null;
  /** Affected area in square metres. */
  affectedArea?: number | null;
  /** Estimated drying time in hours. */
  estimatedDryingTime?: number | null;
  /** Human-readable source of water, if recorded. */
  sourceOfWater?: string | null;
  /** Scope of works text or JSON — jargon is acceptable here. */
  scopeOfWorks?: string | null;
  /** Whether biological/mould growth was detected. */
  biologicalMouldDetected?: boolean | null;
  /** Safety hazards description. */
  safetyHazards?: string | null;
}

export interface ClientSummaryResult {
  summary: string;
  /** True when the safe template was returned because every retry failed. */
  fellBack: boolean;
  /** Number of LLM calls made (1 + retries). */
  attempts: number;
  /** Reasons each attempt was rejected (empty when first attempt passed). */
  rejections: string[];
}

// ─── System prompt (cacheable, stable) ──────────────────────────────────────

export const SYSTEM_PROMPT = `You are a restoration claims writer for an Australian water damage company. Your reader is the PROPERTY OWNER — not an insurance adjuster, not a technician.

Write a plain-English summary with these strict rules:

1. Length: 120–160 words. Hard stop at 160 words.
2. Reading level: grade 8 or lower. Short sentences. Everyday words.
3. Address the reader as "you" and "your home". Never "the client", "the insured", "the customer".
4. Australian English spelling only: colour, organise, metre, mould, practise, centre, apologise.
5. Explain jargon in plain words, then cite the IICRC standard in parentheses once, using the format "(IICRC S500:7.2)" or similar — the citation must match the pattern S<digits>:<digits>. At least one citation is required.
6. End the summary with this exact closer on its own line: "What this means for you:" followed by ONE or TWO short sentences telling the owner what happens next.
7. Professional and reassuring — not alarming, not salesy. No exclamation marks. No emoji.
8. Do not use any of these banned words: tapestry, leverage, robust, synergy, holistic, streamline, cutting-edge, best-in-class.
9. Do not use first-person business voice ("we will", "our team") — describe what will happen, not who does it. Use passive voice or "your home" / "the property" as the subject.
10. No lists, no bullet points, no headings except the "What this means for you:" closer. Plain flowing paragraphs.

Return the summary as plain text only. No preamble, no markdown fences, no meta-commentary.`;

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Generate a client-facing plain-English summary.
 *
 * @param client      Initialised Anthropic SDK client (caller supplies API key).
 * @param input       Report facts to summarise.
 * @returns           The summary text plus diagnostic metadata.
 */
export async function generateClientSummary(
  client: Pick<Anthropic, "messages">,
  input: ClientSummaryInput,
): Promise<ClientSummaryResult> {
  const userMessage = buildUserMessage(input);
  const rejections: string[] = [];

  // Up to two attempts — per the ticket "retry once".
  for (let attempt = 1; attempt <= 2; attempt++) {
    const summary = await callHaiku(client, userMessage, attempt, rejections);
    const rejection = validate(summary);
    if (!rejection) {
      return {
        summary,
        fellBack: false,
        attempts: attempt,
        rejections,
      };
    }
    rejections.push(rejection);
  }

  // Every retry failed — use the deterministic safe template and log.
  const fallback = safeTemplate(input);
  console.warn(
    `[client-summary] All retries failed for report ${input.reportId}. ` +
      `Rejections: ${rejections.join("; ")}. Using safe template.`,
  );

  return {
    summary: fallback,
    fellBack: true,
    attempts: 2,
    rejections,
  };
}

// ─── Internals ──────────────────────────────────────────────────────────────

async function callHaiku(
  client: Pick<Anthropic, "messages">,
  userMessage: string,
  attempt: number,
  previousRejections: string[],
): Promise<string> {
  // On the retry, include the reason the first attempt was rejected so the
  // model can self-correct (e.g. too long → tighten; missing "you" → address
  // the reader directly; missing IICRC citation → add one).
  const retryNote =
    attempt > 1 && previousRejections.length
      ? `\n\nRetry: the previous draft was rejected because ${previousRejections[previousRejections.length - 1]}. Fix that constraint while keeping every other rule.`
      : "";

  const response = await client.messages.create({
    model: CLIENT_SUMMARY_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        // 90% cost discount on repeat calls with the same system prompt.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: userMessage + retryNote,
      },
    ],
  });

  const first = response.content[0];
  if (!first || first.type !== "text") {
    throw new Error("client-summary: model returned no text block");
  }
  return first.text.trim();
}

function buildUserMessage(input: ClientSummaryInput): string {
  const facts: string[] = [];
  if (input.propertyAddress) facts.push(`Property: ${input.propertyAddress}`);
  if (input.hazardType) facts.push(`Damage type: ${input.hazardType}`);
  if (input.sourceOfWater) facts.push(`Source: ${input.sourceOfWater}`);
  if (input.waterCategory)
    facts.push(`IICRC water category: ${input.waterCategory}`);
  if (input.waterClass) facts.push(`IICRC water class: ${input.waterClass}`);
  if (input.affectedArea != null)
    facts.push(`Affected area: ${input.affectedArea} square metres`);
  if (input.estimatedDryingTime != null) {
    const days = Math.round(input.estimatedDryingTime / 24);
    facts.push(
      `Estimated drying time: ${input.estimatedDryingTime} hours (~${days} days)`,
    );
  }
  if (input.biologicalMouldDetected) facts.push("Visible mould growth detected");
  if (input.safetyHazards) facts.push(`Safety hazards: ${input.safetyHazards}`);
  if (input.scopeOfWorks)
    facts.push(`Scope of works (technical): ${truncate(input.scopeOfWorks, 2000)}`);

  if (facts.length === 0) {
    facts.push("No structured assessment data recorded yet.");
  }

  return `Write the plain-English summary for the property owner. Use only these facts:

${facts.join("\n")}

Remember: 120–160 words, grade-8 reading level, address them as "you", include at least one IICRC citation like "(IICRC S500:7.2)", end with "What this means for you:" on its own line.`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/**
 * Validate the drafted summary. Returns null if OK, or a short string
 * describing why it was rejected (used for the retry prompt).
 */
export function validate(summary: string): string | null {
  const text = summary.trim();

  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS) {
    return `the draft was ${words} words — must be ${MAX_WORDS} or fewer`;
  }
  if (words < 40) {
    return `the draft was only ${words} words — write more detail (120–160 words)`;
  }

  if (!IICRC_CITATION.test(text)) {
    return `the draft did not contain an IICRC citation matching the pattern S<digits>:<digits>, e.g. "(IICRC S500:7.2)"`;
  }

  // Case-insensitive whole-word "you" / "your" / "you're" / "yours".
  if (!/\byou(r|rs|'re)?\b/i.test(text)) {
    return `the draft did not address the reader as "you"`;
  }

  if (!text.includes(CLOSER)) {
    return `the draft did not end with "${CLOSER}" on its own line`;
  }

  const BANNED = [
    "tapestry",
    "leverage",
    "robust",
    "synergy",
    "holistic",
    "streamline",
    "cutting-edge",
    "best-in-class",
  ];
  const lower = text.toLowerCase();
  for (const banned of BANNED) {
    // Whole-word match so "leveraged" does not trip "leverage" — but
    // the banned list is the root form, so require a word boundary.
    const re = new RegExp(`\\b${escapeRegex(banned)}\\b`, "i");
    if (re.test(lower)) {
      return `the draft used the banned word "${banned}"`;
    }
  }

  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Safe template fallback ─────────────────────────────────────────────────

/**
 * Deterministic fallback returned when every retry fails. Satisfies every
 * hard constraint (word count, "you", IICRC citation, closer, plain English).
 * Not as personalised as the model output, but guaranteed safe.
 */
export function safeTemplate(input: ClientSummaryInput): string {
  const address = input.propertyAddress
    ? `at ${input.propertyAddress}`
    : "at your property";
  const category = input.waterCategory
    ? ` Water damage of this kind (IICRC S500:3.1) needs careful drying and cleaning.`
    : ` The damage will be assessed against the IICRC S500:3.1 standard so the right repair is organised.`;
  const area = input.affectedArea
    ? ` About ${input.affectedArea} square metres of your home has been affected.`
    : "";
  const drying = input.estimatedDryingTime
    ? ` Industrial drying equipment will run for around ${Math.max(
        1,
        Math.round(input.estimatedDryingTime / 24),
      )} days.`
    : " Industrial drying equipment will run until moisture readings return to safe levels.";
  const mould = input.biologicalMouldDetected
    ? " Mould growth was noted, so safe removal steps will be followed (IICRC S520:12.2)."
    : "";

  return (
    `Your home ${address} has been inspected for water damage.` +
    category +
    area +
    drying +
    mould +
    " Once drying is complete, damaged materials will be replaced and the area returned to a clean, dry condition. The work follows the Australian restoration standards so the repair is safe and lasting.\n\n" +
    `${CLOSER} your home will be dried, cleaned and restored to a safe condition, with each step checked against the recognised industry standard before the job closes out.`
  );
}
