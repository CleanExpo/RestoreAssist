import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockApplyRateLimit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: mockApplyRateLimit }));

import { GET } from "../route";

const ORIGINAL_ENV = { ...process.env };
const request = () =>
  new NextRequest("http://localhost/api/properties/scrape/health");

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
    expect(json.status).toBe("configured_unverified");
    expect(json.configured).toBe(true);
    expect(typeof json.timestamp).toBe("string");
  });

  it("returns 200 when PROPERTY_SCRAPER_URL is present and required", async () => {
    process.env.PROPERTY_SCRAPER_REQUIRED = "1";
    process.env.PROPERTY_SCRAPER_URL = "https://scraper.example.com";
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("configured_unverified");
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
    mockApplyRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Rate limited" }, { status: 429 }),
    );
    const res = await GET(request());
    expect(res.status).toBe(429);
  });
});

// RA-8111 step 2: "ok" / configured=true was read as "the floor-plan source works".
// Each question gets its own field, and none may read as passed without evidence.
describe("GET /api/properties/scrape/health: separate honest fields", () => {
  const UNVERIFIED = "unverified (legal gate RA-6850)";
  const fetchSpy = vi.fn();

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT;
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("makes no outbound request at all, so it cannot prove a provider works", async () => {
    await GET(request());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never reports green status from configuration alone", async () => {
    process.env.PROPERTY_SCRAPER_REQUIRED = "1";
    process.env.PROPERTY_SCRAPER_URL = "https://scraper.example.com";
    const json = await (await GET(request())).json();
    expect(json.status).not.toBe("ok");
    expect(json.verified).toBe(false);
  });

  it("reports configured, reachable, plan, permitted and enabled as separate fields", async () => {
    const json = await (await GET(request())).json();
    expect(json.scope).toBe("configuration-only");
    expect(json.checks).toEqual({
      configured: "ok",
      providerReachable: UNVERIFIED,
      planAvailable: UNVERIFIED,
      sourcePermitted: UNVERIFIED,
      featureEnabled: "off",
    });
    expect(json.note).toMatch(/does not contact any property provider/i);
  });

  it("keeps the unverified fields on the degraded answer", async () => {
    process.env.PROPERTY_SCRAPER_REQUIRED = "1";
    const res = await GET(request());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.verified).toBe(false);
    expect(json.checks).toEqual({
      configured: "missing",
      providerReachable: UNVERIFIED,
      planAvailable: UNVERIFIED,
      sourcePermitted: UNVERIFIED,
      featureEnabled: "off",
    });
  });

  it("reports the feature as off unless the flag is explicitly on", async () => {
    for (const raw of [undefined, "", "0", "false", "yes"]) {
      if (raw === undefined) delete process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT;
      else process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT = raw;
      const json = await (await GET(request())).json();
      expect(json.checks.featureEnabled).toBe("off");
    }
  });

  it("flag on does not make the source permitted or the provider reachable", async () => {
    process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT = "on";
    const json = await (await GET(request())).json();
    expect(json.checks.featureEnabled).toBe("on");
    expect(json.checks.sourcePermitted).toBe(UNVERIFIED);
    expect(json.checks.providerReachable).toBe(UNVERIFIED);
    expect(json.status).toBe("configured_unverified");
    expect(json.warning).toMatch(/RA-6850/);
  });
});
