/**
 * Rules-only router: decides which job-file section an utterance belongs
 * to, or that Margot must ask. No model call (spec: budget DEFERRED, and
 * no standards text may reach an AI tool).
 *
 * Scoring: one point per keyword hit; the section the technician is
 * currently on gets a half-point lead when it has any hit. A clear winner
 * (one point ahead) is filed. Anything else is a question.
 */

import { FIRE_CHECKLIST, getFireSection, type FireChecklistSection } from "./checklist";

export type RouteDecision =
  | { kind: "file"; sectionId: string; score: number }
  | { kind: "ask"; candidateSectionId: string }
  // A spoken N/A is only ever a proposal. Closing a whole section needs the
  // technician's yes, because one sentence can say a part does not apply and
  // still carry a hazard ("gas not applicable, but the wiring is live").
  | { kind: "confirm_na"; sectionId: string; reason: string };

const CURRENT_SECTION_LEAD = 0.5;
const WINNING_MARGIN = 1;

const NA_PATTERNS: RegExp[] = [
  /\bnot applicable\b/,
  /\bn\s?\/\s?a\b/,
  /\bdoes(?:n't| not) apply\b/,
  /\bnothing to (?:report|record|note)\b/,
  /\bmark (?:it|this|that|the section)? ?(?:as )?(?:n\/a|na|not applicable)\b/,
];

const YES = /^(?:yes|yeah|yep|yup|correct|that's right|right|affirmative|sure|ok|okay)\b/;
const NO = /^(?:no|nope|nah|wrong|not that|negative)\b/;

export function normaliseUtterance(text: string): string {
  return text.toLowerCase().replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const keywordPatterns = new Map<string, RegExp>();
function keywordPattern(keyword: string): RegExp {
  let pattern = keywordPatterns.get(keyword);
  if (!pattern) {
    pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(keyword)}(?=$|[^a-z0-9])`);
    keywordPatterns.set(keyword, pattern);
  }
  return pattern;
}

export function scoreSection(section: FireChecklistSection, normalised: string): number {
  return section.keywords.reduce(
    (score, keyword) => (keywordPattern(keyword).test(normalised) ? score + 1 : score),
    0,
  );
}

export function isNaUtterance(text: string): boolean {
  const normalised = normaliseUtterance(text);
  return NA_PATTERNS.some((p) => p.test(normalised));
}

/**
 * A reply that is ONLY a confirmation: a yes or no word, optionally followed by
 * pure acknowledgements. The words are never cut up: anything else ("yes, and
 * the ceiling is sagging", "no power at the switchboard") is not a confirmation
 * and must be kept whole by the caller, because dropping or trimming a word can
 * reverse what the technician said.
 */
const BARE_YES =
  /^(?:yes|yeah|yep|yup|correct|that's right|right|affirmative|sure|ok|okay)(?:[\s,.!]+(?:yes|that's right|that is right|correct|please|thanks|thank you))*[\s,.!]*$/;
const BARE_NO = /^(?:no|nope|nah|wrong|not that|negative)(?:[\s,.!]+(?:no|please|thanks|thank you))*[\s,.!]*$/;

export function parseBareConfirmation(text: string): "yes" | "no" | null {
  const normalised = normaliseUtterance(text).replace(/^[^a-z]+/, "");
  if (BARE_YES.test(normalised)) return "yes";
  if (BARE_NO.test(normalised)) return "no";
  return null;
}

export function parseYesNo(text: string): "yes" | "no" | null {
  const normalised = normaliseUtterance(text).replace(/^[^a-z]+/, "");
  if (YES.test(normalised)) return "yes";
  if (NO.test(normalised)) return "no";
  return null;
}

export function routeUtterance(
  transcript: string,
  currentSectionId?: string,
): RouteDecision {
  const normalised = normaliseUtterance(transcript);
  const current = currentSectionId ? getFireSection(currentSectionId) : undefined;

  if (current && isNaUtterance(normalised)) {
    return { kind: "confirm_na", sectionId: current.id, reason: transcript.trim() };
  }

  const scored = FIRE_CHECKLIST.map((section) => {
    const hits = scoreSection(section, normalised);
    const lead = current && section.id === current.id && hits > 0 ? CURRENT_SECTION_LEAD : 0;
    return { sectionId: section.id, score: hits + lead };
  }).sort((a, b) => b.score - a.score);

  const [top, second] = scored;
  if (top.score === 0) {
    return { kind: "ask", candidateSectionId: current?.id ?? FIRE_CHECKLIST[0].id };
  }
  if (top.score - (second?.score ?? 0) >= WINNING_MARGIN) {
    return { kind: "file", sectionId: top.sectionId, score: top.score };
  }
  // A tie or a narrow lead: ask, preferring the current section if it is in the running.
  const inRunning = scored.filter((s) => top.score - s.score < WINNING_MARGIN);
  const candidate =
    current && inRunning.some((s) => s.sectionId === current.id) ? current.id : top.sectionId;
  return { kind: "ask", candidateSectionId: candidate };
}

/** Margot's clarifying question, e.g. "Is this part of the safety brief?" */
export function clarifyingQuestion(sectionId: string): string {
  const section = getFireSection(sectionId);
  const title = section
    ? section.title.charAt(0).toLowerCase() + section.title.slice(1)
    : "this section";
  return `Is this part of the ${title}?`;
}
