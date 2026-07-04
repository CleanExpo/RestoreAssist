import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

function makeReq(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/auth/dev-login${query}`);
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/auth/dev-login", () => {
  it("returns 404 when NODE_ENV is not development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_LOGIN_TOKEN", "dev-token");
    vi.resetModules();
    const { GET } = await import("../route");
    const res = await GET(makeReq("?token=dev-token"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when token does not match DEV_LOGIN_TOKEN", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_LOGIN_TOKEN", "dev-token");
    vi.resetModules();
    const { GET } = await import("../route");
    const res = await GET(makeReq("?token=wrong"));
    expect(res.status).toBe(404);
  });

  it("escapes email and callbackUrl query params to prevent reflected XSS", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_LOGIN_TOKEN", "dev-token");
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-for-vitest-only");
    vi.resetModules();
    const { GET } = await import("../route");

    const email = encodeURIComponent('x"><script>alert(1)</script>');
    const callbackUrl = encodeURIComponent('"><img src=x onerror=alert(2)>');
    const res = await GET(
      makeReq(`?token=dev-token&email=${email}&callbackUrl=${callbackUrl}`),
    );
    expect(res.status).toBe(200);

    const html = await res.text();
    // Raw breakout payloads must NOT appear verbatim in the response.
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x onerror=alert(2)>");
    // Escaped forms must be present instead.
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&quot;&gt;&lt;img src=x onerror=alert(2)&gt;");
  });

  it("renders the safe default email + callbackUrl when params are omitted", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_LOGIN_TOKEN", "dev-token");
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-for-vitest-only");
    vi.resetModules();
    const { GET } = await import("../route");
    const res = await GET(makeReq("?token=dev-token"));
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("phill.mcgurk@gmail.com");
    expect(html).toContain('value="/dashboard"');
  });
});
