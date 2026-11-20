/**
 * RA-8232 — import failure messages map to actionable UI copy.
 */
import { describe, expect, it } from "vitest";
import { importSketchUserMessage } from "../import-sketch-user-message";

describe("RA-8232 import message matrix", () => {
  const cases: Array<[number, Record<string, string>, RegExp]> = [
    [402, { code: "SUBSCRIPTION_REQUIRED" }, /subscription/i],
    [429, { code: "RATE_LIMITED" }, /Too many/i],
    [413, { code: "FILE_TOO_LARGE" }, /too large/i],
    [503, { code: "READER_UNAVAILABLE" }, /unavailable/i],
    [500, {}, /server/i],
  ];

  it.each(cases)("status %i code %j", (status, body, pattern) => {
    expect(importSketchUserMessage(status, body)).toMatch(pattern);
  });
});
