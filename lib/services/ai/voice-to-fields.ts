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
 * When a generic term like "tiles" matches and a distinctive word of an
 * asbestos-possible material (vinyl, lino, linoleum, asbestos, fibro) is
 * in the same clause, resolve to that material or surface both — never
 * silently choose ceramic-tile. A negated cue ("not vinyl", "no asbestos",
 * "non-asbestos", "asbestos-free") cancels only that cue. A hyphenated
 * look, style, or effect ("vinyl-look") is not an asbestos cue. Spoken
 * "vinyl look" (a space, as speech-to-text often writes it), "whether or
 * not", "not sure if", and a question mark are doubt, not negation: ask,
 * and do not pick a material. When more than one material is still a
 * candidate and any of them may contain asbestos, ask instead of keeping
 * the longest phrase.
 * When more than one water category is mentioned, return no category and
 * surface confirmation — a negated or corrected category must never yield
 * a lower category. Spoken-word categories ("category three") count.
 */

import {
  ANZ_MATERIALS,
  getMaterial,
  type AnzMaterial,
} from "@/lib/anz/materials";
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

const ACM_CUE_WORDS: Array<{ word: string; materialId: string }> = [
  { word: "vinyl", materialId: "vinyl-tiles" },
  { word: "lino", materialId: "vinyl-tiles" },
  { word: "linoleum", materialId: "vinyl-tiles" },
  { word: "asbestos", materialId: "fibro" },
  { word: "fibro", materialId: "fibro" },
];

/** "not vinyl", "no asbestos", "non-asbestos", "asbestos-free". */
const CUE_NEGATION_BEFORE = /(?:^|[^a-z0-9])(?:not|no|non)[\s-]*$/i;
const CUE_FREE_AFTER = /^[\s-]*free\b/i;
/** "vinyl-look" describes appearance. A space ("vinyl look") is doubt, not a drop. */
const CUE_HYPHEN_APPEARANCE_AFTER = /^-(?:look|style|effect)\b/i;
const CUE_SPACED_APPEARANCE_AFTER = /^\s+(?:look|style|effect)\b/i;
const CUE_DOUBT_BEFORE =
  /\bwhether\s+or\s+not[\s-]*$|\bnot\s+sure\s+if\b/i;

type AcmCueKind = "clear" | "doubt" | "ignore";

interface ClassifiedCue {
  kind: AcmCueKind;
  materialId: string;
  word: string;
  start: number;
}

const CLAUSE_BOUNDARY = /[,.;:!?]/;

function clauseContaining(
  text: string,
  start: number,
  end: number,
): { text: string; start: number; end: number } {
  let from = 0;
  for (let i = start - 1; i >= 0; i--) {
    if (CLAUSE_BOUNDARY.test(text[i] ?? "")) {
      from = i + 1;
      break;
    }
  }
  let to = text.length;
  for (let i = end; i < text.length; i++) {
    if (CLAUSE_BOUNDARY.test(text[i] ?? "")) {
      to = i;
      break;
    }
  }
  while (from < to && /\s/.test(text[from] ?? "")) from += 1;
  while (to > from && /\s/.test(text[to - 1] ?? "")) to -= 1;
  return { text: text.slice(from, to), start: from, end: to };
}

function classifyAcmCue(
  before: string,
  after: string,
  question: boolean,
): AcmCueKind {
  if (CUE_SPACED_APPEARANCE_AFTER.test(after)) return "doubt";
  if (question || CUE_DOUBT_BEFORE.test(before)) return "doubt";
  if (CUE_HYPHEN_APPEARANCE_AFTER.test(after)) return "ignore";
  if (CUE_FREE_AFTER.test(after) || CUE_NEGATION_BEFORE.test(before)) {
    return "ignore";
  }
  return "clear";
}

function classifiedAcmCues(clause: string, question: boolean): ClassifiedCue[] {
  const cues: ClassifiedCue[] = [];
  for (const cue of ACM_CUE_WORDS) {
    const re = new RegExp(`\\b${cue.word}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = re.exec(clause)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const kind = classifyAcmCue(
        clause.slice(0, start),
        clause.slice(end),
        question,
      );
      if (kind !== "ignore") {
        cues.push({
          kind,
          materialId: cue.materialId,
          word: match[0],
          start,
        });
      }
      if (re.lastIndex === match.index) re.lastIndex += 1;
    }
  }
  return cues;
}

function materialsForIds(ids: string[]): AnzMaterial[] {
  return [...new Set(ids)]
    .map((id) => getMaterial(id))
    .filter((material): material is AnzMaterial => material != null);
}

function cueAsMatch(
  transcript: string,
  clauseStart: number,
  cue: ClassifiedCue,
): PhraseMatch | undefined {
  const material = getMaterial(cue.materialId);
  if (!material) return undefined;
  const start = clauseStart + cue.start;
  const end = start + cue.word.length;
  return {
    phrase: transcript.slice(start, end),
    material,
    start,
    end,
  };
}

/**
 * Generic "tile(s)" must not win uncontested when the same clause names a
 * distinctive word of an asbestos-possible material. Negation and a hyphenated
 * appearance word cancel only the cue they govern. Doubt, and an explicit
 * "ceramic" beside a real cue, are surfaced — never guessed.
 */
function applyAcmCuesToCeramicMatches(
  transcript: string,
  primary: PhraseMatch[],
): { matches: PhraseMatch[]; ambiguousTerm?: string; doubts: PhraseMatch[] } {
  const adjusted: PhraseMatch[] = [];
  const doubts: PhraseMatch[] = [];
  for (const match of primary) {
    if (match.material.id !== "ceramic-tile") {
      adjusted.push(match);
      continue;
    }
    const clause = clauseContaining(transcript, match.start, match.end);
    const question = /^\s*\?/.test(transcript.slice(clause.end));
    const cues = classifiedAcmCues(clause.text, question);
    const clear = cues.filter((cue) => cue.kind === "clear");
    const doubt = cues.filter((cue) => cue.kind === "doubt");
    const clearMaterials = materialsForIds(clear.map((cue) => cue.materialId));

    if (doubt.length > 0) {
      adjusted.push(match);
      for (const cue of [...doubt, ...clear]) {
        const hinted = cueAsMatch(transcript, clause.start, cue);
        if (hinted) doubts.push(hinted);
      }
      continue;
    }

    if (clearMaterials.length === 0) {
      adjusted.push(match);
      continue;
    }
    const namesCeramic = /\bceramic\b/i.test(clause.text);
    if (namesCeramic || clearMaterials.length > 1) {
      const outsideAcm = primary.some(
        (other) =>
          other !== match &&
          other.material.isPotentialAcm &&
          (other.end <= clause.start || other.start >= clause.end),
      );
      if (!outsideAcm && doubts.length === 0) {
        return { matches: [], ambiguousTerm: clause.text, doubts: [] };
      }
      adjusted.push(match);
      for (const cue of clear) {
        const hinted = cueAsMatch(transcript, clause.start, cue);
        if (hinted) doubts.push(hinted);
      }
      continue;
    }
    const acm = clearMaterials[0];
    if (!acm) {
      adjusted.push(match);
      continue;
    }
    adjusted.push({ ...match, material: acm });
  }
  return { matches: adjusted, doubts };
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

  const withCues = applyAcmCuesToCeramicMatches(transcript, primary);
  if (withCues.ambiguousTerm) {
    return { ambiguousTerm: withCues.ambiguousTerm };
  }
  const resolvedMatches = withCues.matches;

  const conflict = resolvedMatches.find((a) =>
    resolvedMatches.some(
      (b) =>
        a !== b && a.material.id !== b.material.id && spansOverlap(a, b),
    ),
  );
  if (conflict) {
    const conflicting = resolvedMatches.filter((a) =>
      resolvedMatches.some(
        (b) =>
          a !== b && a.material.id !== b.material.id && spansOverlap(a, b),
      ),
    );
    const start = Math.min(...conflicting.map((m) => m.start));
    const end = Math.max(...conflicting.map((m) => m.end));
    return { ambiguousTerm: transcript.slice(start, end) };
  }

  // A negated cue cancels only itself. If another material is still in play
  // and any candidate may contain asbestos, ask — never keep the longest phrase.
  const byId = new Map<string, PhraseMatch>();
  for (const candidate of [...resolvedMatches, ...withCues.doubts]) {
    const existing = byId.get(candidate.material.id);
    if (!existing || candidate.start < existing.start) {
      byId.set(candidate.material.id, candidate);
    }
  }
  const candidates = [...byId.values()];
  if (
    candidates.length > 1 &&
    candidates.some((candidate) => candidate.material.isPotentialAcm)
  ) {
    const ordered = [...candidates].sort((a, b) => a.start - b.start);
    const term = ordered
      .map((candidate) => transcript.slice(candidate.start, candidate.end))
      .join(", ");
    return { ambiguousTerm: term };
  }

  return { material: resolvedMatches[0]?.material };
}

const CATEGORY_MENTION_RE =
  /\b(?:category|cat)\s*_?\s*(\d+|one|two|three)\b/gi;

function tokenToWaterCategory(token: string): WaterCategory | undefined {
  const t = token.toLowerCase();
  if (t === "1" || t === "one") return "cat1";
  if (t === "2" || t === "two") return "cat2";
  if (t === "3" || t === "three") return "cat3";
  return undefined;
}

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
    const token = match[1] ?? "";
    const raw = match[0] ?? "";
    const start = match.index ?? 0;
    const category = tokenToWaterCategory(token);
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

function isWaterCategoryMention(mention: string): boolean {
  return /^(?:category|cat)\s*_?\s*(?:\d+|one|two|three)\b/i.test(
    mention.trim(),
  );
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
    if (isWaterCategoryMention(mention)) continue;
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
