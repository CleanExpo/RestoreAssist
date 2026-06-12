import { describe, it, expect } from "vitest";
import { teleprompterPrompts } from "../prompts";

describe("teleprompterPrompts", () => {
  it("returns 2-3 short prompts referencing the claim context", () => {
    const p = teleprompterPrompts({
      jobType: "Water damage",
      suburb: "Bulimba",
    });
    expect(p.length).toBeGreaterThanOrEqual(2);
    expect(p.length).toBeLessThanOrEqual(3);
    expect(p.join(" ")).toMatch(/Bulimba|water/i);
  });

  it("works with no context (generic fallback)", () => {
    const p = teleprompterPrompts({});
    expect(p.length).toBeGreaterThanOrEqual(2);
    expect(p.length).toBeLessThanOrEqual(3);
    expect(p.every((s) => s.trim().length > 0)).toBe(true);
  });
});
