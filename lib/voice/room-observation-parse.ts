/**
 * RA-7694: voice parity for the structured room observations (odour, visible
 * growth, staining). Pure; called by transcript-parser.ts.
 *
 * Reads only what was said. It never names a species and never infers a
 * condition. A "suspected" or "possible" wording is carried as a hypothesis.
 */

import type { ObservationType, ParsedObservation } from "./types";

export type RoomObservationVoiceType = Extract<
  ObservationType,
  "odour_observation" | "growth_observation" | "staining_observation"
>;

export interface RoomObservationVoiceResult {
  type: RoomObservationVoiceType;
  parsed: Pick<
    ParsedObservation,
    | "odourDescriptor"
    | "odourIntensity"
    | "odourPattern"
    | "areaM2"
    | "basis"
    | "note"
  >;
}

const ODOUR_WORD = /\b(smell|smells|smelly|smelling|odou?rs?|stink|stinks|stinky|reek|reeks|musty|mustiness)\b/i;
const STAIN_WORD =
  /\b(stain|stains|stained|staining|water\s*marks?|tide\s*marks?|discolou?r(?:ed|ation)?)\b/i;
const GROWTH_WORD =
  /\b(?:visible\s+(?:mou?ld|growth|fungal)|(?:mou?ld|fungal)\s+(?:growth|patch(?:es)?|spots?)|growth|black\s+spots?|mou?ld\s+on)\b/i;

const DESCRIPTORS = [
  "musty",
  "sewage",
  "smoke",
  "sour",
  "earthy",
  "damp",
  "chemical",
  "rotten",
  "sweet",
] as const;

function descriptor(text: string): string | undefined {
  const lower = text.toLowerCase();
  return DESCRIPTORS.find((d) => lower.includes(d));
}

function pattern(text: string): "CONSTANT" | "INTERMITTENT" | undefined {
  if (/\b(intermittent(?:ly)?|comes?\s+and\s+goes?|on\s+and\s+off|now\s+and\s+then|at\s+times|sometimes)\b/i.test(text)) {
    return "INTERMITTENT";
  }
  if (/\b(constant(?:ly)?|all\s+the\s+time|continuous(?:ly)?|always|persistent(?:ly)?)\b/i.test(text)) {
    return "CONSTANT";
  }
  return undefined;
}

const WORD_NUMBER: Record<string, 1 | 2 | 3> = {
  "1": 1,
  one: 1,
  "2": 2,
  two: 2,
  "3": 3,
  three: 3,
};

function intensity(text: string): 1 | 2 | 3 | undefined {
  const num = text.match(/\bintensity\s*(?:of\s*)?(1|2|3|one|two|three)\b/i);
  if (num) return WORD_NUMBER[num[1].toLowerCase()];
  if (/\b(faint|slight|mild|light)\b/i.test(text)) return 1;
  if (/\b(moderate|noticeable)\b/i.test(text)) return 2;
  if (/\b(strong|heavy|overpowering|pungent|intense)\b/i.test(text)) return 3;
  return undefined;
}

function area(text: string): number | undefined {
  const m = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:square\s*met(?:re|er)s?|sq\.?\s*m(?:et(?:re|er)s?)?|m2|m²)/i,
  );
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 10000 ? n : undefined;
}

/** Returns null when the transcript is not one of the three observations. */
export function parseRoomObservation(
  transcript: string,
): RoomObservationVoiceResult | null {
  const text = transcript.trim();
  const basis = /\b(suspected|possible|possibly|might\s+be|looks?\s+like|appears?\s+to\s+be)\b/i.test(text)
    ? ("HYPOTHESISED" as const)
    : ("OBSERVED" as const);

  if (ODOUR_WORD.test(text)) {
    return {
      type: "odour_observation",
      parsed: {
        odourDescriptor: descriptor(text),
        odourIntensity: intensity(text),
        odourPattern: pattern(text),
        basis,
        note: text,
      },
    };
  }
  if (STAIN_WORD.test(text)) {
    return {
      type: "staining_observation",
      parsed: { basis, note: text },
    };
  }
  if (GROWTH_WORD.test(text)) {
    return {
      type: "growth_observation",
      parsed: { areaM2: area(text), basis, note: text },
    };
  }
  return null;
}
