import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { GET } from "../route";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Reset env between tests so tests don't pollute each other.
  delete process.env.PROPERTY_SCRAPER_REQUIRED;
  delete process.env.PROPERTY_SCRAPER_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("GET /api/properties/scrape/health", () => {
  it("returns 200 / ok when nothing is required and no override is set", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.configured).toBe(true);
    expect(typeof json.timestamp).toBe("string");
  });

  it("returns 200 when PROPERTY_SCRAPER_URL is present and required", async () => {
    process.env.PROPERTY_SCRAPER_REQUIRED = "1";
    process.env.PROPERTY_SCRAPER_URL = "https://scraper.example.com";
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
  });

  it("returns 503 / degraded when PROPERTY_SCRAPER_REQUIRED=1 but URL is missing", async () => {
    process.env.PROPERTY_SCRAPER_REQUIRED = "1";
    const res = await GET();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe("degraded");
    expect(json.configured).toBe(false);
    expect(json.reason).toMatch(/PROPERTY_SCRAPER_URL/);
  });

  it("ignores PROPERTY_SCRAPER_URL when not required", async () => {
    process.env.PROPERTY_SCRAPER_URL = "";
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
