/**
 * RA-437: Vision prompts for moisture meter reading extraction.
 * Supports Delmhorst, Protimeter, and Tramex meters — common in Australian
 * water damage restoration (IICRC S500:2025 §8).
 */

export type MeterBrand = "delmhorst" | "protimeter" | "tramex" | "unknown";

export interface MeterReadingResult {
  brand: MeterBrand;
  model?: string;
  readingValue: number | null; // e.g. 18.5
  readingUnit: "%" | "WME" | "RH" | "unknown";
  scale?: string; // e.g. "Wood", "Reference", "WME"
  displayText: string; // Raw text visible on screen
  confidence: "high" | "medium" | "low";
  notes?: string;
}

/**
 * System prompt for moisture meter reading extraction via Claude Vision.
 */
export const METER_EXTRACTION_SYSTEM_PROMPT = `You are an expert at reading moisture meter displays used in water damage restoration (IICRC S500:2025 §8).

You specialise in these brands:
- Delmhorst (BD-2100, J-2000, Navigator Pro): displays %MC (moisture content) on LCD
- Protimeter (Surveymaster, MMS2, Aquant): displays %WME or %RH on digital display
- Tramex (MEP, CMEXpert II, Skipper Plus): dial or digital, reads %MC or relative scale

Your task: extract the exact numeric reading shown on the meter display.

Respond ONLY with valid JSON matching this schema:
{
  "brand": "delmhorst" | "protimeter" | "tramex" | "unknown",
  "model": string | null,
  "readingValue": number | null,
  "readingUnit": "%" | "WME" | "RH" | "unknown",
  "scale": string | null,
  "displayText": string,
  "confidence": "high" | "medium" | "low",
  "notes": string | null
}

Rules:
- readingValue must be a number (e.g. 18.5, not "18.5%")
- If you cannot read the display clearly, set readingValue to null and confidence to "low"
- displayText should be exactly what you can read on the screen
- notes should explain any uncertainty or unusual reading conditions`;

export const METER_EXTRACTION_USER_PROMPT =
  "Extract the moisture reading from this meter display. Return JSON only.";

/**
 * Build the messages array for a Claude Vision meter extraction call.
 */
export function buildMeterExtractionMessages(
  base64Image: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg",
) {
  return [
    {
      role: "user" as const,
      content: [
        {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mediaType,
            data: base64Image,
          },
        },
        {
          type: "text" as const,
          text: METER_EXTRACTION_USER_PROMPT,
        },
      ],
    },
  ];
}

/**
 * Parse the Claude Vision response JSON into a typed MeterReadingResult.
 * Returns null if parsing fails.
 */
export function parseMeterResponse(
  responseText: string,
): MeterReadingResult | null {
  try {
    const cleaned = responseText
      .replace(/^```json\s*/m, "")
      .replace(/^```\s*/m, "")
      .replace(/```$/m, "")
      .trim();
    const parsed = JSON.parse(cleaned) as MeterReadingResult;
    if (typeof parsed.displayText !== "string") return null;
    if (!["high", "medium", "low"].includes(parsed.confidence)) return null;
    return parsed;
  } catch {
    return null;
  }
}
