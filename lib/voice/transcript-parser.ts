/**
 * RA-396: Parses raw STT transcripts into structured VoiceObservation data.
 *
 * Handles field speech patterns including:
 * - Muffled N95/P2 mask speech (higher error rate on fricatives)
 * - Ambient noise (dehumidifiers, air movers at 60–80 dB)
 * - Shorthand ("bathroom wall, 24 percent" / "BD two one hundred, eighteen five")
 */

import type { ObservationType, ParsedObservation } from "./types";

interface ParseResult {
  type: ObservationType;
  parsed: ParsedObservation;
  confidence: "high" | "medium" | "low";
  needsConfirmation: boolean;
}

// Room name aliases — AU field speech patterns
const ROOM_ALIASES: Record<string, string> = {
  bath: "bathroom",
  ensuite: "ensuite",
  en: "ensuite",
  "en suite": "ensuite",
  "toilet": "bathroom",
  lounge: "living room",
  family: "family room",
  dining: "dining room",
  kitchen: "kitchen",
  laundry: "laundry",
  garage: "garage",
  passage: "hallway",
  hall: "hallway",
  corridor: "hallway",
  bedroom: "bedroom",
  master: "master bedroom",
  bed: "bedroom",
  roof: "roof cavity",
  ceiling: "roof cavity",
  subfloor: "subfloor",
  crawl: "subfloor",
  under: "subfloor",
};

// Material aliases
const MATERIAL_ALIASES: Record<string, string> = {
  gyprock: "plasterboard",
  plaster: "plasterboard",
  "plaster board": "plasterboard",
  "plaster wall": "plasterboard",
  carpet: "carpet",
  "hard floor": "timber floor",
  timber: "timber floor",
  hardwood: "timber floor",
  fc: "fibre cement",
  "fibre cement": "fibre cement",
  "fiber cement": "fibre cement",
  concrete: "concrete slab",
  slab: "concrete slab",
  brick: "brick veneer",
  villaboard: "villaboard",
};

// Moisture reading patterns — handles "18", "18.5", "18 percent", "18 point 5"
const MOISTURE_RE = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:percent|%|wme|WME|rh|RH|point\s+(\d))?/i;

// Room detection — looks for room name anywhere in the transcript
function extractRoom(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [alias, canonical] of Object.entries(ROOM_ALIASES)) {
    if (lower.includes(alias)) return canonical;
  }
  return undefined;
}

// Material detection
function extractMaterial(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [alias, canonical] of Object.entries(MATERIAL_ALIASES)) {
    if (lower.includes(alias)) return canonical;
  }
  return undefined;
}

// Moisture value extraction — handles "18 point 5" speech pattern
function extractMoistureValue(text: string): number | null {
  // Handle "18 point 5" → 18.5
  const pointMatch = text.match(/(\d{1,3})\s+point\s+(\d)/i);
  if (pointMatch) {
    return parseFloat(`${pointMatch[1]}.${pointMatch[2]}`);
  }

  const match = text.match(MOISTURE_RE);
  if (match) {
    const raw = match[1].replace(",", ".");
    const val = parseFloat(raw);
    // Sanity check: moisture readings are typically 0–100, alarm at >80
    if (val >= 0 && val <= 100) return val;
  }
  return null;
}

// Unit extraction
function extractUnit(text: string): ParsedObservation["unit"] {
  const lower = text.toLowerCase();
  if (lower.includes("wme")) return "WME";
  if (lower.includes(" rh") || lower.includes("relative humidity")) return "RH";
  if (lower.includes("temperature") || lower.includes("temp") || lower.includes("degrees")) return "°C";
  return "%";
}

// Category extraction
function extractCategory(text: string): 1 | 2 | 3 | undefined {
  if (/cat(?:egory)?\s*(?:one|1)/i.test(text)) return 1;
  if (/cat(?:egory)?\s*(?:two|2)/i.test(text)) return 2;
  if (/cat(?:egory)?\s*(?:three|3)/i.test(text)) return 3;
  if (/clean water/i.test(text)) return 1;
  if (/grey water|gray water|washing machine|dishwasher/i.test(text)) return 2;
  if (/sewage|black water|flood/i.test(text)) return 3;
  return undefined;
}

// Damage class extraction
function extractClass(text: string): 1 | 2 | 3 | 4 | undefined {
  if (/class\s*(?:one|1)/i.test(text)) return 1;
  if (/class\s*(?:two|2)/i.test(text)) return 2;
  if (/class\s*(?:three|3)/i.test(text)) return 3;
  if (/class\s*(?:four|4)/i.test(text)) return 4;
  return undefined;
}

// Psychrometric detection — temp + RH together
function isPsychrometric(text: string): boolean {
  return (
    (/temp(?:erature)?/i.test(text) || /degrees/i.test(text)) &&
    (/relative humidity|rh|\bhumidity\b/i.test(text))
  );
}

// Equipment note detection
function isEquipmentNote(text: string): boolean {
  return /dehumidifier|air mover|blower|fan|desiccant|inject|hepa|LGR|dryer/i.test(text);
}

// Room entry detection ("entering", "moving to", "now in")
function isRoomEntry(text: string): boolean {
  return /(?:entering|moving to|now in|in the|going to)\s+(?:the\s+)?/i.test(text);
}

/**
 * Parse a raw STT transcript into a structured observation.
 */
export function parseTranscript(transcript: string): ParseResult {
  const text = transcript.trim();
  const lower = text.toLowerCase();

  const room = extractRoom(text);
  const material = extractMaterial(text);
  const value = extractMoistureValue(text);
  const unit = extractUnit(text);
  const category = extractCategory(text);
  const damageClass = extractClass(text);

  // ── Psychrometric reading ──
  if (isPsychrometric(text)) {
    return {
      type: "psychrometric",
      parsed: { room, note: text, s500Section: "§6" },
      confidence: "medium",
      needsConfirmation: true,
    };
  }

  // ── Category statement ──
  if (category !== undefined) {
    return {
      type: "category_statement",
      parsed: { category, room, s500Section: "§7.1" },
      confidence: "high",
      needsConfirmation: false,
    };
  }

  // ── Class statement ──
  if (damageClass !== undefined) {
    return {
      type: "class_statement",
      parsed: { damageClass, room, s500Section: "§7.2" },
      confidence: "high",
      needsConfirmation: false,
    };
  }

  // ── Equipment note ──
  if (isEquipmentNote(text)) {
    return {
      type: "equipment_note",
      parsed: { room, note: text, s500Section: "§14" },
      confidence: "medium",
      needsConfirmation: true,
    };
  }

  // ── Room entry ──
  if (isRoomEntry(text) && room) {
    return {
      type: "room_entry",
      parsed: { room },
      confidence: "high",
      needsConfirmation: false,
    };
  }

  // ── Moisture reading — the most common observation ──
  if (value !== null) {
    const confidence: "high" | "medium" | "low" =
      room && material
        ? "high"
        : room || material
        ? "medium"
        : "low";

    return {
      type: "moisture_reading",
      parsed: { value, unit, room, material, s500Section: "§8" },
      confidence,
      // Require confirmation if value is very high (>40%) or context is ambiguous
      needsConfirmation: confidence === "low" || value > 40,
    };
  }

  // ── General note — fallback ──
  return {
    type: "general_note",
    parsed: { room, note: text },
    confidence: "low",
    needsConfirmation: true,
  };
}

/**
 * Format a confirmation prompt based on what was parsed.
 * This is what the copilot says back to the tech.
 */
export function buildConfirmationPrompt(
  parsed: ParsedObservation,
  type: ObservationType,
  confidence: "high" | "medium" | "low",
): string {
  switch (type) {
    case "moisture_reading":
      if (parsed.value !== null && parsed.value !== undefined) {
        const loc = [parsed.room, parsed.material].filter(Boolean).join(", ");
        if (loc) {
          return `${loc}, ${parsed.value}${parsed.unit === "%" ? "%" : ` ${parsed.unit}`}. Confirmed?`;
        }
        return `${parsed.value}${parsed.unit === "%" ? "%" : ` ${parsed.unit}`} — which room and material?`;
      }
      return "I didn't catch the reading value — can you repeat?";

    case "category_statement":
      return `Category ${parsed.category} confirmed — ${getCategoryDesc(parsed.category)}.`;

    case "class_statement":
      return `Class ${parsed.damageClass} confirmed.`;

    case "psychrometric":
      return `Psychrometric data noted. Can you give me the exact temperature and RH values?`;

    case "equipment_note":
      return `Equipment noted${parsed.room ? ` in ${parsed.room}` : ""}. Want me to log it?`;

    case "room_entry":
      return `Moving to ${parsed.room}.`;

    case "general_note":
      if (confidence === "low") {
        return `I got that. Just to confirm — ${parsed.note?.slice(0, 80)}?`;
      }
      return `Noted.`;

    default:
      return "Got it.";
  }
}

function getCategoryDesc(category?: 1 | 2 | 3): string {
  switch (category) {
    case 1: return "clean water source";
    case 2: return "grey water";
    case 3: return "black water / sewage";
    default: return "";
  }
}
