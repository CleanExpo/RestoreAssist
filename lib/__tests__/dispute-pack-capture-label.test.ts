/**
 * RA-7090 slice 2 review round 2 (MUST-FIX 1): the dispute pack must print
 * the SERVER receipt time alongside the device-claimed capture time.
 *
 * On a signed record capturedAt is derived from the client's manifest, so
 * printing it alone let a backdated claim read as established fact under a
 * verified banner. createdAt is a server default and cannot be signed into
 * the past.
 */
import { describe, it, expect } from "vitest";
import { signedCaptureLabel } from "../dispute-pack";

describe("signedCaptureLabel", () => {
  it("shows BOTH times when the capture time and the receipt time differ", () => {
    const label = signedCaptureLabel({
      capturedAt: new Date("2026-07-01T02:30:00.000Z"),
      createdAt: new Date("2026-07-25T09:15:00.000Z"),
    });
    expect(label).toContain("Rec:");
    // Two distinct dates are visible to the reader.
    expect(label.split("\n")).toHaveLength(2);
    expect(label.split("\n")[0]).not.toBe(label.split("\n")[1]);
  });

  it("makes a backdated capture visibly distinct from its receipt time", () => {
    const label = signedCaptureLabel({
      capturedAt: new Date("2019-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-07-25T09:15:00.000Z"),
    });
    expect(label).toContain("2019");
    expect(label).toContain("Rec:");
    expect(label).toContain("2026");
  });

  it("collapses to a single line when the two times render identically", () => {
    const same = new Date("2026-07-25T09:15:00.000Z");
    const label = signedCaptureLabel({ capturedAt: same, createdAt: same });
    expect(label).not.toContain("Rec:");
    expect(label.split("\n")).toHaveLength(1);
  });

  it("falls back to the capture time alone when no receipt time is available", () => {
    const label = signedCaptureLabel({
      capturedAt: new Date("2026-07-25T09:15:00.000Z"),
    });
    expect(label).not.toContain("Rec:");
  });
});
