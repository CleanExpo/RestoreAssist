import { describe, expect, it } from "vitest";
import { resolveFirecrawlKey } from "../providers/firecrawl";

describe("resolveFirecrawlKey", () => {
  it("returns the trimmed FIRECRAWL_API_KEY", () => {
    expect(resolveFirecrawlKey({ FIRECRAWL_API_KEY: " fc-abc " })).toBe(
      "fc-abc",
    );
  });

  it("returns null when unset or blank", () => {
    expect(resolveFirecrawlKey({})).toBeNull();
    expect(resolveFirecrawlKey({ FIRECRAWL_API_KEY: "   " })).toBeNull();
  });
});
