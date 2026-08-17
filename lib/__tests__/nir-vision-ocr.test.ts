import { describe, expect, it } from "vitest";
import { meterReadingToOcrExtraction } from "../nir-vision-ocr";
import type { MeterReadingResult } from "@/lib/vision/meter-prompts";

const base: MeterReadingResult = {
  brand: "tramex",
  readingValue: 18.5,
  readingUnit: "%",
  scale: "Wood",
  displayText: "18.5%",
  confidence: "high",
};

describe("meterReadingToOcrExtraction", () => {
  it("maps moisture readings for confirm UI", () => {
    const ocr = meterReadingToOcrExtraction(base, "moisture");
    expect(ocr.type).toBe("moisture");
    if (ocr.type === "moisture") {
      expect(ocr.moisturePercent).toBe(18.5);
      expect(ocr.materialType).toBe("Wood");
      expect(ocr.rawText).toBe("18.5%");
    }
  });

  it("maps RH displays into environmental humidity", () => {
    const ocr = meterReadingToOcrExtraction(
      { ...base, readingUnit: "RH", displayText: "55% RH", readingValue: 55 },
      "environmental",
    );
    expect(ocr.type).toBe("environmental");
    if (ocr.type === "environmental") {
      expect(ocr.relativeHumidityPercent).toBe(55);
      expect(ocr.temperatureCelsius).toBeNull();
    }
  });
});
