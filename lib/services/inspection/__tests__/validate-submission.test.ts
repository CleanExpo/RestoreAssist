import { describe, expect, it } from "vitest";
import { validateSubmissionPayload } from "../validate-submission";

describe("validateSubmissionPayload", () => {
  it("returns ok for a complete inspection", () => {
    const r = validateSubmissionPayload({
      id: "insp-1",
      status: "DRAFT",
      affectedAreas: [{ id: "a" }],
      moistureReadings: [{ id: "m" }],
      photos: [{ id: "p" }],
    });
    expect(r.ok).toBe(true);
  });

  it("returns INVALID_STATUS when not in DRAFT", () => {
    const r = validateSubmissionPayload({
      id: "insp-1",
      status: "SUBMITTED",
      affectedAreas: [{ id: "a" }],
      moistureReadings: [{ id: "m" }],
      photos: [{ id: "p" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVALID_STATUS");
  });

  it("returns MISSING_AFFECTED_AREAS when zero areas", () => {
    const r = validateSubmissionPayload({
      id: "insp-1",
      status: "DRAFT",
      affectedAreas: [],
      moistureReadings: [{ id: "m" }],
      photos: [{ id: "p" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("MISSING_AFFECTED_AREAS");
  });

  it("returns MISSING_MOISTURE_READINGS when zero readings", () => {
    const r = validateSubmissionPayload({
      id: "insp-1",
      status: "DRAFT",
      affectedAreas: [{ id: "a" }],
      moistureReadings: [],
      photos: [{ id: "p" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("MISSING_MOISTURE_READINGS");
  });

  it("returns MISSING_PHOTOS when zero photos", () => {
    const r = validateSubmissionPayload({
      id: "insp-1",
      status: "DRAFT",
      affectedAreas: [{ id: "a" }],
      moistureReadings: [{ id: "m" }],
      photos: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("MISSING_PHOTOS");
  });

  it("only needs id to count items — extra fields are not required", () => {
    // Demonstrates the interface signal: validator reads .length only.
    const r = validateSubmissionPayload({
      id: "insp-1",
      status: "DRAFT",
      affectedAreas: [{ id: "a" }],
      moistureReadings: [{ id: "m" }],
      photos: [{ id: "p" }],
    });
    expect(r.ok).toBe(true);
  });
});
