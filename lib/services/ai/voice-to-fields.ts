/**
 * RA-7613 — map a Whisper (or queued) voice-note transcript onto existing
 * enumerated job fields only.
 *
 * Allowed targets: ANZ material slugs (plus documented aliases, including
 * singular/plural forms of the last word), `cat1|cat2|cat3`, and numeric
 * dimensions in metres. A term that does not exact-match is returned in
 * `needsConfirmation` — never guessed into a neighbouring slug via substring.
 *
 * Prefer the longest / most specific alias. When two different materials
 * still match the same words, surface confirmation instead of guessing.
 * When more than one water category is mentioned, return no category and
 * surface confirmation — a negated or corrected category must never yield
 * a lower category.
 */

import { ANZ_MATERIALS, type AnzMaterial } from "@/lib/anz/materials";
import { type WaterCategory } from "@/lib/anz/water-category";

export type VoiceConfirmationKind = "material" | "waterCategory" | "dimension";

export interface VoiceConfirmationItem {
  kind: VoiceConfirmationKind;
  term: string;
}

export interface VoiceFieldMapping {
  material?: AnzMaterial;
  waterCategory?: WaterCategory;
  dimensions?: { lengthM?: number; widthM?: number };
  needsConfirmation: VoiceConfirmationItem[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Singular and plural of the last word so "vinyl tile" also matches "vinyl tiles". */
function inflectLastWord(phrase: string): string[] {
  const trimmed = phrase.trim();
  if (!trimmed) return [];
  const words = trimmed.split(/\s+/);
  const last = words.at(-1);
  if (!last) return [trimmed];
  const head = words.slice(0, -1);
  const join = (word: string) =>
    head.length > 0 ? [...head, word].join(" ") : word;
  const out = new Set<string>([trimmed]);
  if (/ies$/i.test(last) && last.length > 3) {
    out.add(join(`${last.slice(0, -3)}y`));
  } else if (/s$/i.test(last) && !/ss$/i.test(last) && last.length > 1) {
    out.add(join(last.slice(0, -1)));
  } else if (/y$/i.test(last) && last.length > 1 && !/[aeiou]y$/i.test(last)) {
    out.add(join(`${last.slice(0, -1)}ies`));
  } else {
    out.add(join(`${last}s`));
  }
  return [...out];
}

interface CatalogTerm {
  phrase: string;
  material: AnzMaterial;
}

function catalogTerms(): CatalogTerm[] {
  const terms: CatalogTerm[] = [];
  for (const material of ANZ_MATERIALS) {
    const phrases = new Set<string>();
    phrases.add(material.id);
    phrases.add(material.name);
    const stem = material.name.split("(")[0]?.trim();
    if (stem) phrases.add(stem);
    for (const alias of material.aliases ?? []) phrases.add(alias);
    for (const phrase of phrases) {
      const trimmed = phrase.trim();
      if (!trimmed) continue;
      for (const inflected of inflectLastWord(trimmed)) {
        terms.push({ phrase: inflected, material });
      }
    }
  }
  terms.sort((a, b) => b.phrase.length - a.phrase.length);
  return terms;
}

const CATALOG_TERMS = catalogTerms();

interface PhraseMatch {
  phrase: string;
  material: AnzMaterial;
  start: number;
  end: number;
}

function findPhraseSpans(
  haystack: string,
  needle: string,
): Array<{ start: number; end: number }> {
  const trimmed = needle.trim();
  if (!trimmed) return [];
  const re = new RegExp(
    `(^|[^a-z0-9])(${escapeRegExp(trimmed)})(?=$|[^a-z0-9])`,
    "gi",
  );
  const spans: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(haystack)) !== null) {
    const prefixLen = match[1]?.length ?? 0;
    const start = match.index + prefixLen;
    const end = start + (match[2]?.length ?? 0);
    if (end > start) spans.push({ start, end });
    if (re.lastIndex === match.index) re.lastIndex += 1;
  }
  return spans;
}

function collectMaterialMatches(transcript: string): PhraseMatch[] {
  const matches: PhraseMatch[] = [];
  for (const term of CATALOG_TERMS) {
    for (const span of findPhraseSpans(transcript, term.phrase)) {
      matches.push({
        phrase: term.phrase,
        material: term.material,
        start: span.start,
        end: span.end,
      });
    }
  }
  matches.sort((a, b) => {
    const lenDiff = b.phrase.length - a.phrase.length;
    if (lenDiff !== 0) return lenDiff;
    return a.start - b.start;
  });
  return matches;
}

function spansOverlap(a: PhraseMatch, b: PhraseMatch): boolean {
  return a.start < b.end && b.start < a.end;
}

function isContainedIn(inner: PhraseMatch, outer: PhraseMatch): boolean {
  return (
    inner.start >= outer.start &&
    inner.end <= outer.end &&
    inner.phrase.length < outer.phrase.length
  );
}

interface MaterialResolution {
  material?: AnzMaterial;
  ambiguousTerm?: string;
}

function resolveMaterial(transcript: string): MaterialResolution {
  const matches = collectMaterialMatches(transcript);
  if (matches.length === 0) return {};

  // Longest / most specific first. Drop a generic alias fully contained in a
  // longer match (ceramic "tiles" inside vinyl "vinyl tiles").
  const primary: PhraseMatch[] = [];
  for (const match of matches) {
    if (primary.some((kept) => isContainedIn(match, kept))) continue;
    primary.push(match);
  }

  const conflict = primary.find((a) =>
    primary.some(
      (b) =>
        a !== b && a.material.id !== b.material.id && spansOverlap(a, b),
    ),
  );
  if (conflict) {
    const conflicting = primary.filter((a) =>
      primary.some(
        (b) =>
          a !== b && a.material.id !== b.material.id && spansOverlap(a, b),
      ),
    );
    const start = Math.min(...conflicting.map((m) => m.start));
    const end = Math.max(...conflicting.map((m) => m.end));
    return { ambiguousTerm: transcript.slice(start, end) };
  }

  return { material: primary[0]?.material };
}

const CATEGORY_MENTION_RE = /\b(?:category|cat)\s*_?\s*(\d+)\b/gi;

const NEGATION_BEFORE =
  /(?:\b(?:not|never|no)\b|\b(?:is|was|are|were)n'?t\b)(?:\s+\w+){0,3}\s*$/i;

function mentionIsNegated(transcript: string, start: number): boolean {
  return NEGATION_BEFORE.test(transcript.slice(0, start));
}

function findWaterCategory(
  transcript: string,
  needsConfirmation: VoiceConfirmationItem[],
): WaterCategory | undefined {
  const mentions: Array<{
    raw: string;
    category?: WaterCategory;
    negated: boolean;
  }> = [];

  for (const match of transcript.matchAll(CATEGORY_MENTION_RE)) {
    const digit = match[1] ?? "";
    const raw = match[0] ?? "";
    const start = match.index ?? 0;
    const category: WaterCategory | undefined =
      digit === "1" ? "cat1" : digit === "2" ? "cat2" : digit === "3" ? "cat3" : undefined;
    mentions.push({
      raw,
      category,
      negated: mentionIsNegated(transcript, start),
    });
  }

  if (mentions.length === 0) return undefined;

  const unknown = mentions.filter((m) => m.category == null);
  for (const item of unknown) {
    needsConfirmation.push({ kind: "waterCategory", term: item.raw });
  }

  const known = mentions.filter(
    (m): m is { raw: string; category: WaterCategory; negated: boolean } =>
      m.category != null,
  );
  const uniqueKnown = [...new Set(known.map((m) => m.category))];

  // Two different categories (or a known plus an unknown) — never guess, and
  // never lower a corrected / negated category to the first match in the string.
  if (uniqueKnown.length > 1 || (uniqueKnown.length >= 1 && unknown.length >= 1)) {
    if (!needsConfirmation.some((item) => item.kind === "waterCategory")) {
      needsConfirmation.push({
        kind: "waterCategory",
        term: mentions.map((m) => m.raw).join(", "),
      });
    }
    return undefined;
  }

  if (uniqueKnown.length === 1) {
    const category = uniqueKnown[0];
    const ofThat = known.filter((m) => m.category === category);
    if (ofThat.some((m) => m.negated)) {
      needsConfirmation.push({
        kind: "waterCategory",
        term: ofThat[0]?.raw ?? category,
      });
      return undefined;
    }
    return category;
  }

  return undefined;
}

function parsePositiveMetres(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 200) return null;
  return Math.round(n * 100) / 100;
}

function findDimensions(transcript: string): {
  lengthM?: number;
  widthM?: number;
} | undefined {
  const pair = transcript.match(
    /(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?/i,
  );
  if (pair) {
    const lengthM = parsePositiveMetres(pair[1]);
    const widthM = parsePositiveMetres(pair[2]);
    if (lengthM != null && widthM != null) return { lengthM, widthM };
  }
  const single = transcript.match(
    /(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\b/i,
  );
  if (single) {
    const lengthM = parsePositiveMetres(single[1]);
    if (lengthM != null) return { lengthM };
  }
  return undefined;
}

function normaliseMention(raw: string): string {
  return raw
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mentionMatchesCatalog(mention: string): boolean {
  const lower = mention.toLowerCase();
  return CATALOG_TERMS.some((term) => term.phrase.toLowerCase() === lower);
}

/**
 * Phrases the speaker offered as a material ("walls are Wonderboard") that
 * are not in the ANZ catalog. Surfaced for confirmation; never mapped.
 */
function unmatchedMaterialMentions(transcript: string): string[] {
  const mentions: string[] = [];
  const re =
    /\b(?:are|is|of)\s+(?:the\s+|a\s+|an\s+)?([A-Za-z][A-Za-z0-9][A-Za-z0-9 /-]{0,40})/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(transcript)) !== null) {
    const mention = normaliseMention(match[1] ?? "");
    if (!mention) continue;
    if (mentionMatchesCatalog(mention)) continue;
    if (resolveMaterial(mention).material) continue;
    mentions.push(mention);
  }
  return mentions;
}

export function mapVoiceTranscriptToFields(
  transcript: string,
): VoiceFieldMapping {
  const text = transcript.trim();
  const needsConfirmation: VoiceConfirmationItem[] = [];
  if (!text) return { needsConfirmation };

  const resolved = resolveMaterial(text);
  if (resolved.ambiguousTerm) {
    needsConfirmation.push({ kind: "material", term: resolved.ambiguousTerm });
  }
  const material = resolved.material;
  const waterCategory = findWaterCategory(text, needsConfirmation);
  const dimensions = findDimensions(text);

  for (const mention of unmatchedMaterialMentions(text)) {
    if (
      material &&
      (mention.toLowerCase() === material.id ||
        mention.toLowerCase() === material.name.toLowerCase())
    ) {
      continue;
    }
    needsConfirmation.push({ kind: "material", term: mention });
  }

  const result: VoiceFieldMapping = { needsConfirmation };
  if (material) result.material = material;
  if (waterCategory) result.waterCategory = waterCategory;
  if (dimensions) result.dimensions = dimensions;
  return result;
}
