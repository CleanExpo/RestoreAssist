import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { apiError, logRefusal } from "../api-errors";

/**
 * RA-8388: a refusal nobody can see.
 *
 * `apiError` reported only 5xx, so every 4xx refusal was silent unless the
 * route author remembered to write a warn line by hand. Three review rounds
 * each found another silent refusal. The line now has one owner.
 */
describe("apiError leaves a line for every refusal", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  const request = new NextRequest(
    "https://app.example.test/api/inspections/insp-1/evidence?token=never-logged",
    { method: "POST" },
  );

  function refusalLines(): Record<string, unknown>[] {
    return warn.mock.calls
      .filter((call) => call[0] === "[api-refusal]")
      .map((call) => JSON.parse(String(call[1])));
  }

  it("logs code, status, route, stage and event id for a 4xx", async () => {
    const response = apiError(request, {
      code: "VALIDATION",
      message: "Reading 61 is outside the range a signed row accepts",
      status: 400,
      stage: "field-contract",
    });

    const lines = refusalLines();
    expect(lines).toHaveLength(1);
    const body = await response.json();
    expect(lines[0]).toEqual({
      code: "VALIDATION",
      status: 400,
      route: "/api/inspections/insp-1/evidence",
      stage: "field-contract",
      eventId: body.error.eventId,
    });
  });

  it("never logs the message, the query string or the context", () => {
    apiError(request, {
      code: "VALIDATION",
      message: "secret-looking-message",
      status: 422,
      context: { userId: "user-1", value: "61" },
      fields: { ambientTemperature: "too high" },
    });

    const raw = warn.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(raw).not.toContain("secret-looking-message");
    expect(raw).not.toContain("never-logged");
    expect(raw).not.toContain("user-1");
    expect(raw).not.toContain("too high");
  });

  it("does not add a refusal line to a 5xx, which is already reported", () => {
    apiError(request, { code: "INTERNAL", message: "boom", status: 500 });

    expect(refusalLines()).toHaveLength(0);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("does not send a 4xx to the error feed", () => {
    apiError(request, { code: "NOT_FOUND", message: "gone", status: 404 });

    expect(error).not.toHaveBeenCalled();
    expect(refusalLines()).toHaveLength(1);
  });

  it("logRefusal writes the same line for a route that answers in its own shape", () => {
    logRefusal(request, { code: "FORBIDDEN", status: 403, stage: "tenancy" });

    const lines = refusalLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      code: "FORBIDDEN",
      status: 403,
      route: "/api/inspections/insp-1/evidence",
      stage: "tenancy",
    });
    expect(typeof lines[0].eventId).toBe("string");
  });
});
