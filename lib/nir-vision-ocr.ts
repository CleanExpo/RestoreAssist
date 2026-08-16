/**
 * NIR Vision OCR — type stubs for meter photo extraction
 * Full implementation pending Phase 2 pilot.
 */

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
