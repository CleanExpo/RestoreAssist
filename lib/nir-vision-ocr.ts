/**
 * NIR Vision OCR Service
 *
 * Sends meter/device display photos to Claude Vision and extracts structured readings.
 * Eliminates admin double-handling: tech photographs the meter screen, AI reads the numbers.
 *
 * Supported devices:
 *   Moisture meters   — Tramex MEP, Delmhorst BD-2100, Tramex CMEXv5
 *   Thermo-hygro      — Testo 605-H1, Vaisala HM70 (Temp/RH/Dew point)
 *   Laser measures    — Leica Disto, Bosch GLM series
 *
 * Pattern: follows claim-analysis-engine.ts — direct Anthropic SDK, base64 image block.
 * The caller is responsible for obtaining the user's Anthropic API key.
 */

import Anthropic from '@anthropic-ai/sdk'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExtractionType = 'moisture' | 'environmental' | 'measurement'

export interface MoistureExtraction {
  type: 'moisture'
  moisturePercent: number | null
  materialType?: string
  unit: '%'
  confidence: 'high' | 'medium' | 'low'
  rawText: string
}

export interface EnvironmentalExtraction {
  type: 'environmental'
  temperatureCelsius?: number | null
  relativeHumidityPercent?: number | null
  dewPointCelsius?: number | null
  confidence: 'high' | 'medium' | 'low'
  rawText: string
}

export interface MeasurementExtraction {
  type: 'measurement'
  primaryValue: number | null
  unit: 'm' | 'mm' | 'cm' | 'ft' | 'in' | null
  secondaryValue?: number | null
  secondaryUnit?: string | null
  confidence: 'high' | 'medium' | 'low'
  rawText: string
}

export type OcrExtraction = MoistureExtraction | EnvironmentalExtraction | MeasurementExtraction

export interface OcrResult {
  success: boolean
  extraction?: OcrExtraction
  error?: string
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const PROMPTS: Record<ExtractionType, string> = {
  moisture: `You are reading a moisture meter display (e.g. Tramex, Delmhorst, or similar).
Extract the numeric values shown on the screen.
Return ONLY this JSON object, no explanation:
{
  "moisturePercent": <number — the main moisture reading, or null if unreadable>,
  "materialType": <string or null — the material mode if shown, e.g. "wood", "concrete", "drywall">,
  "rawText": <string — exactly what you can read on the display>
}`,

  environmental: `You are reading a thermo-hygrometer or environmental meter display (e.g. Testo 605-H1, Vaisala HM70, or similar).
Extract ALL readings visible on the screen.
If the display shows °F, convert to °C: (°F − 32) × 5/9.
Return ONLY this JSON object, no explanation:
{
  "temperatureCelsius": <number or null>,
  "relativeHumidityPercent": <number or null>,
  "dewPointCelsius": <number or null>,
  "rawText": <string — exactly what you can read on the display>
}`,

  measurement: `You are reading a laser distance measure display (e.g. Leica Disto, Bosch GLM, or similar).
Extract the primary measurement on the main display line, and any secondary value (area or volume) if shown.
Return ONLY this JSON object, no explanation:
{
  "primaryValue": <number or null>,
  "unit": <"m" | "mm" | "cm" | "ft" | "in" | null>,
  "secondaryValue": <number or null — area or volume if shown>,
  "secondaryUnit": <string or null — e.g. "m²", "m³">,
  "rawText": <string — exactly what you can read on the display>
}`,
}

// ── Confidence scoring ────────────────────────────────────────────────────────

function assessConfidence(
  rawText: string,
  parsed: Record<string, unknown>
): 'high' | 'medium' | 'low' {
  // Can't read the display at all
  if (!rawText || rawText.length < 2) return 'low'

  // Count how many primary numeric fields came back null
  const numericValues = Object.entries(parsed).filter(
    ([key]) => !['rawText', 'unit', 'materialType', 'secondaryUnit'].includes(key)
  )
  const nullCount = numericValues.filter(([, v]) => v === null || v === undefined).length

  if (nullCount === 0) return 'high'
  if (nullCount === 1) return 'medium'
  return 'low'
}

// ── Main extraction function ──────────────────────────────────────────────────

/**
 * Extract meter readings from a base64-encoded image.
 *
 * @param imageBase64  - Base64-encoded image data (no data: prefix)
 * @param mediaType    - MIME type of the image
 * @param extractionType - What type of meter is in the photo
 * @param apiKey       - User's Anthropic API key (from their BYOK integration)
 */
export async function extractMeterReading(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  extractionType: ExtractionType,
  apiKey: string
): Promise<OcrResult> {
  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: PROMPTS[extractionType],
            },
          ],
        },
      ],
    })

    const rawResponse = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    // Strip markdown code fences if the model wraps its JSON output
    const jsonText = rawResponse
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    const parsed = JSON.parse(jsonText) as Record<string, unknown>
    const confidence = assessConfidence((parsed.rawText as string) ?? '', parsed)

    if (extractionType === 'moisture') {
      return {
        success: true,
        extraction: {
          type: 'moisture',
          moisturePercent: (parsed.moisturePercent as number) ?? null,
          materialType: (parsed.materialType as string) ?? undefined,
          unit: '%',
          confidence,
          rawText: (parsed.rawText as string) ?? '',
        },
      }
    }

    if (extractionType === 'environmental') {
      return {
        success: true,
        extraction: {
          type: 'environmental',
          temperatureCelsius: (parsed.temperatureCelsius as number) ?? null,
          relativeHumidityPercent: (parsed.relativeHumidityPercent as number) ?? null,
          dewPointCelsius: (parsed.dewPointCelsius as number) ?? null,
          confidence,
          rawText: (parsed.rawText as string) ?? '',
        },
      }
    }

    // measurement
    return {
      success: true,
      extraction: {
        type: 'measurement',
        primaryValue: (parsed.primaryValue as number) ?? null,
        unit: (parsed.unit as MeasurementExtraction['unit']) ?? null,
        secondaryValue: (parsed.secondaryValue as number) ?? null,
        secondaryUnit: (parsed.secondaryUnit as string) ?? null,
        confidence,
        rawText: (parsed.rawText as string) ?? '',
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // JSON parse failures usually mean the model returned unexpected output
    if (message.includes('JSON') || message.includes('parse')) {
      return {
        success: false,
        error: 'Could not read the meter display clearly. Try retaking the photo with better lighting and less glare.',
      }
    }
    return {
      success: false,
      error: `OCR extraction failed: ${message}`,
    }
  }
}
