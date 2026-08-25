import { describe, expect, it } from "vitest";
import { resolveApifyToken } from "../providers/apify";

describe("resolveApifyToken", () => {
  it("prefers APIFY_API_TOKEN over APIFY_API_KEY", () => {
    expect(
      resolveApifyToken({
        APIFY_API_TOKEN: " token-a ",
        APIFY_API_KEY: "token-b",
      }),
    ).toBe("token-a");
  });

  it("falls back to APIFY_API_KEY", () => {
    expect(resolveApifyToken({ APIFY_API_KEY: "token-b" })).toBe("token-b");
  });

  it("returns null when neither is set", () => {
    expect(resolveApifyToken({})).toBeNull();
    expect(resolveApifyToken({ APIFY_API_TOKEN: "  " })).toBeNull();
  });
});
