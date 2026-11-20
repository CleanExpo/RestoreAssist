import { describe, expect, it } from "vitest";
import { parseIsoQueryParam } from "../parse-iso-query";

describe("parseIsoQueryParam", () => {
  it("allows empty", () => {
    expect(parseIsoQueryParam(null)).toEqual({ ok: true, value: null });
    expect(parseIsoQueryParam("  ")).toEqual({ ok: true, value: null });
  });

  it("parses valid ISO", () => {
    const r = parseIsoQueryParam("2026-01-15T00:00:00.000Z");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("rejects garbage", () => {
    expect(parseIsoQueryParam("not-a-date").ok).toBe(false);
  });
});