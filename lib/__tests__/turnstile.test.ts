import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { verifyTurnstile } from "../turnstile";

describe("verifyTurnstile", () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  afterEach(() => {
    if (originalSecret) process.env.TURNSTILE_SECRET_KEY = originalSecret;
    globalThis.fetch = originalFetch;
  });

  it("soft-allows when TURNSTILE_SECRET_KEY is unset (dev / staging)", async () => {
    const result = await verifyTurnstile("any-token");
    expect(result).toEqual({ ok: true, disabled: true });
  });

  it("rejects when secret is configured but token is empty", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const result = await verifyTurnstile(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("missing");
  });

  it("rejects when secret is configured but token is wrong type", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const result = await verifyTurnstile("");
    expect(result.ok).toBe(false);
  });

  it("rejects when token is absurdly long (DoS protection)", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const result = await verifyTurnstile("x".repeat(3000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("too long");
  });

  it("accepts a token that Cloudflare verifies successfully", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const result = await verifyTurnstile("valid-token");
    expect(result.ok).toBe(true);
  });

  it("rejects when Cloudflare says invalid", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            "error-codes": ["invalid-input-response"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ) as unknown as typeof fetch;
    const result = await verifyTurnstile("bad-token");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("invalid-input-response");
  });

  it("fails-closed when Cloudflare returns non-200", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    globalThis.fetch = vi.fn(
      async () => new Response("nope", { status: 503 }),
    ) as unknown as typeof fetch;
    const result = await verifyTurnstile("token");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("503");
  });

  it("fails-closed on network error", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const result = await verifyTurnstile("token");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("ECONNREFUSED");
  });

  it("passes remoteIp to Cloudflare when provided", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn(async (_url, init) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;
    await verifyTurnstile("token", "203.0.113.42");
    expect(capturedBody).toContain("remoteip=203.0.113.42");
  });
});
