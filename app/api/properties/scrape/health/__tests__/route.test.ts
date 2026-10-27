import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockApplyRateLimit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: mockApplyRateLimit }));

import { GET } from "../route";

const ORIGINAL_ENV = { ...process.env };
const request = () => new NextRequest("http://localhost/api/properties/scrape/health");

beforeEach(() => {
  mockApplyRateLimit.mockReset().mockResolvedValue(null);
  // Reset env between tests so tests don't pollute each other.
  delete process.env.PROPERTY_SCRAPER_REQUIRED;
  delete process.env.PROPERTY_SCRAPER_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("GET /api/properties/scrape/health", () => {
  it("returns 200 / ok when nothing is required and no override is set", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.configured).toBe(true);
    expect(typeof json.timestamp).toBe("string");
  });

  it("returns 200 when PROPERTY_SCRAPER_URL is present and required", async () => {
    process.env.PROPERTY_SCRAPER_REQUIRED = "1";
    process.env.PROPERTY_SCRAPER_URL = "https://scraper.example.com";
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
  });

  it("returns 503 / degraded when PROPERTY_SCRAPER_REQUIRED=1 but URL is missing", async () => {
    process.env.PROPERTY_SCRAPER_REQUIRED = "1";
    const res = await GET(request());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe("degraded");
    expect(json.configured).toBe(false);
    expect(json.reason).toMatch(/PROPERTY_SCRAPER_URL/);
  });

  it("ignores PROPERTY_SCRAPER_URL when not required", async () => {
    process.env.PROPERTY_SCRAPER_URL = "";
    const res = await GET(request());
    expect(res.status).toBe(200);
  });

  it("returns a rate limit response before health details", async () => {
    mockApplyRateLimit.mockResolvedValue(NextResponse.json({ error: "Rate limited" }, { status: 429 }));
    const res = await GET(request());
    expect(res.status).toBe(429);
  });
});

// Sketch package 27/10 P0A: "ok" here once read as "the floor-plan source works".
// The answer must say what was not checked, so nobody can read it that way.
describe("GET /api/properties/scrape/health: what it did not check", () => {
  const UNCHECKED = {
    providerConnectivity: "not_checked",
    sourceImageAvailability: "not_checked",
    sourceRights: "unknown",
  };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT;
  });

  it("says plainly that it checked configuration only", async () => {
    const json = await (await GET(request())).json();
    expect(json.scope).toBe("configuration-only");
    expect(json.checks.configuration).toBe("ok");
    expect(json.note).toMatch(/does not contact any property provider/i);
  });

  it("never reports provider connectivity, image availability or rights as passed", async () => {
    process.env.PROPERTY_SCRAPER_REQUIRED = "1";
    process.env.PROPERTY_SCRAPER_URL = "https://scraper.example.com";
    const json = await (await GET(request())).json();
    expect(json.status).toBe("ok");
    expect(json.checks).toMatchObject(UNCHECKED);
  });

  it("keeps the same unknown fields on the degraded answer", async () => {
    process.env.PROPERTY_SCRAPER_REQUIRED = "1";
    const res = await GET(request());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.scope).toBe("configuration-only");
    expect(json.checks).toMatchObject({ ...UNCHECKED, configuration: "missing" });
  });

  it("reports the URL-import legal release as off unless explicitly switched on", async () => {
    for (const raw of [undefined, "", "0", "false", "yes"]) {
      if (raw === undefined) delete process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT;
      else process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT = raw;
      const json = await (await GET(request())).json();
      expect(json.checks.urlImportRelease).toBe("off");
    }
  });

  it("reports the URL-import legal release as on only for an explicit on value", async () => {
    process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT = "on";
    const json = await (await GET(request())).json();
    expect(json.checks.urlImportRelease).toBe("on");
  });
});
