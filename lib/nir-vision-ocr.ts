/**
 * Meter photo OCR types + adapters to the real vision extract-reading service.
 * Callers should POST /api/vision/extract-reading — not a stub analyze-photo route.
 */

import type { MeterReadingResult } from "@/lib/vision/meter-prompts";

export type ExtractionType = "moisture" | "environmental" | "measurement";

export type OcrExtraction =
  | {
      type: "moisture";
      moisturePercent: number | null;
      /**
       * Null when the meter display could not be read. It must NOT fall back to
       * 0 — a fabricated 0% reads as "bone dry", the opposite of an unknown
       * reading. The vision route legitimately returns a SUCCESSFUL result with
       * a null reading whenever confidence is medium or high (only
       * null-plus-low is mapped to NO_READING_DETECTED), so this case is
       * reachable in normal operation.
       */
      value: number | null;
      unit: string;
      materialType?: string | null;
      surfaceType?: string;
      rawText?: string | null;
      confidence?: "high" | "medium" | "low";
    }
  | {
      type: "environmental";
      temperatureCelsius: number | null;
      relativeHumidityPercent: number | null;
      dewPointCelsius: number | null;
      temperature?: number;
      humidity?: number;
      dewPoint?: number;
      rawText?: string | null;
      confidence?: "high" | "medium" | "low";
    }
  | {
      type: "measurement";
      primaryValue: number | null;
      value: number;
      unit: string;
      secondaryValue?: number | null;
      secondaryUnit?: string | null;
      rawText?: string | null;
      confidence?: "high" | "medium" | "low";
    };

/**
 * Map Claude Vision meter extraction into the UI confirm-form shape.
 * The live API is moisture-meter oriented; environmental / measurement modes
 * adapt the same reading when the display unit matches (e.g. RH).
 */
export function meterReadingToOcrExtraction(
  reading: MeterReadingResult,
  mode: ExtractionType,
): OcrExtraction {
  const rawText = reading.displayText || reading.notes || null;
  const confidence = reading.confidence;
  const value = reading.readingValue;

  if (mode === "environmental") {
    const isRh =
      reading.readingUnit === "RH" ||
      /rh|humidity/i.test(reading.scale ?? "") ||
      /rh|humidity/i.test(reading.displayText ?? "");
    return {
      type: "environmental",
      temperatureCelsius: isRh ? null : value,
      relativeHumidityPercent: isRh ? value : null,
      dewPointCelsius: null,
      temperature: isRh ? undefined : (value ?? undefined),
      humidity: isRh ? (value ?? undefined) : undefined,
      rawText,
      confidence,
    };
  }

  if (mode === "measurement") {
    const unit =
      reading.readingUnit === "%" || reading.readingUnit === "WME"
        ? "m"
        : reading.readingUnit === "unknown"
          ? "m"
          : reading.readingUnit;
    return {
      type: "measurement",
      primaryValue: value,
      value: value ?? 0,
      unit,
      rawText,
      confidence,
    };
  }

  return {
    type: "moisture",
    moisturePercent: value,
    value: value ?? 0,
    unit:
      reading.readingUnit === "unknown"
        ? "%"
        : reading.readingUnit === "RH"
          ? "%"
          : reading.readingUnit,
    materialType: reading.scale ?? null,
    rawText,
    confidence,
  };
}
