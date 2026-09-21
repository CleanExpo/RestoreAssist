/**
 * RA-7613 — map a Whisper (or queued) voice-note transcript onto existing
 * enumerated job fields only.
 *
 * Allowed targets: ANZ material slugs (plus documented aliases),
 * `cat1|cat2|cat3`, and numeric dimensions in metres. A term that does not
 * exact-match is returned in `needsConfirmation` — never guessed into a
 * neighbouring slug via substring.
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

function hasWholePhrase(haystack: string, needle: string): boolean {
  const trimmed = needle.trim();
  if (!trimmed) return false;
  const re = new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(trimmed)}($|[^a-z0-9])`,
    "i",
  );
  return re.test(haystack);
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
      if (phrase.trim()) terms.push({ phrase: phrase.trim(), material });
    }
  }
  terms.sort((a, b) => b.phrase.length - a.phrase.length);
  return terms;
}

const CATALOG_TERMS = catalogTerms();

function findMaterial(transcript: string): AnzMaterial | undefined {
  for (const term of CATALOG_TERMS) {
    if (hasWholePhrase(transcript, term.phrase)) return term.material;
  }
  return undefined;
}

const WATER_PATTERNS: Array<{ re: RegExp; category: WaterCategory }> = [
  { re: /\b(?:category|cat)\s*_?\s*1\b/i, category: "cat1" },
  { re: /\b(?:category|cat)\s*_?\s*2\b/i, category: "cat2" },
  { re: /\b(?:category|cat)\s*_?\s*3\b/i, category: "cat3" },
  { re: /\bcat1\b/i, category: "cat1" },
  { re: /\bcat2\b/i, category: "cat2" },
  { re: /\bcat3\b/i, category: "cat3" },
];

function findWaterCategory(
  transcript: string,
  needsConfirmation: VoiceConfirmationItem[],
): WaterCategory | undefined {
  const unknown = transcript.match(/\b(?:category|cat)\s*_?\s*(\d+)\b/i);
  if (unknown) {
    const n = unknown[1];
    if (n !== "1" && n !== "2" && n !== "3") {
      needsConfirmation.push({ kind: "waterCategory", term: unknown[0] });
    }
  }
  for (const pattern of WATER_PATTERNS) {
    if (pattern.re.test(transcript)) return pattern.category;
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
    if (findMaterial(mention)) continue;
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

  const material = findMaterial(text);
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
