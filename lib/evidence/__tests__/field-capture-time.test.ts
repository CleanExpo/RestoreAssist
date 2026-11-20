import { describe, it, expect, vi, afterEach } from "vitest";
import { parseFieldCaptureTime } from "../field-capture-time";

describe("parseFieldCaptureTime", () => {
  afterEach(() => vi.useRealTimers());

  it("parses a valid ISO time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T12:00:00.000Z"));
    expect(
      parseFieldCaptureTime("2026-11-19T11:30:00.000Z")?.toISOString(),
    ).toBe("2026-11-19T11:30:00.000Z");
  });

  it("rejects future times beyond skew", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T12:00:00.000Z"));
    expect(parseFieldCaptureTime("2026-11-19T12:10:00.000Z")).toBeNull();
  });

  it("rejects invalid strings", () => {
    expect(parseFieldCaptureTime("not-a-date")).toBeNull();
    expect(parseFieldCaptureTime(null)).toBeNull();
  });
});