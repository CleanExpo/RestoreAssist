import { describe, it, expect } from "vitest";
import { evidenceClassCapturedTotal } from "../supplementary-evidence-counts";

describe("evidenceClassCapturedTotal", () => {
  const supplementary = { moistureReadings: 4, psychrometricReadings: 2 };

  it("adds moisture table rows for MOISTURE_READING", () => {
    expect(
      evidenceClassCapturedTotal("MOISTURE_READING", 1, supplementary),
    ).toBe(5);
  });

  it("adds psychrometric rows for AMBIENT_ENVIRONMENTAL", () => {
    expect(
      evidenceClassCapturedTotal("AMBIENT_ENVIRONMENTAL", 0, supplementary),
    ).toBe(2);
  });

  it("uses evidence items only for other classes", () => {
    expect(evidenceClassCapturedTotal("PHOTO_DAMAGE", 3, supplementary)).toBe(
      3,
    );
  });
});