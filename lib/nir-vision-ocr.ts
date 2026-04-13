/**
 * NIR Vision OCR — type stubs for meter photo extraction
 * Full implementation pending Phase 2 pilot.
 */

export type ExtractionType = "moisture" | "environmental" | "measurement";

export type OcrExtraction =
  | {
      type: "moisture";
      moisturePercent: number | null;
      value: number;
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
