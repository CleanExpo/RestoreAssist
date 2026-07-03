import { afterEach, describe, expect, it } from "vitest";
import { getAppUrl } from "../app-url";

const original = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (original === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = original;
  }
});

describe("getAppUrl", () => {
  it("returns the configured NEXT_PUBLIC_APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.restoreassist.app";
    expect(getAppUrl()).toBe("https://staging.restoreassist.app");
  });

  it("strips trailing slashes so paths can be appended safely", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://restoreassist.app/";
    expect(getAppUrl()).toBe("https://restoreassist.app");
  });

  it("falls back to production — never localhost — when unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getAppUrl()).toBe("https://restoreassist.app");
  });

  it("falls back to production when set to whitespace", () => {
    process.env.NEXT_PUBLIC_APP_URL = "   ";
    expect(getAppUrl()).toBe("https://restoreassist.app");
  });
});
