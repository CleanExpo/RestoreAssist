import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  getClientIp: vi.fn().mockReturnValue("203.0.113.10"),
}));

const { POST } = await import("../route");

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/observability/client-error", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body,
  }) as unknown as NextRequest;
}

describe("POST /api/observability/client-error", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects oversized requests from content-length before parsing", async () => {
    const response = await POST(
      makeRequest("{}", {
        "content-length": String(32 * 1024 + 1),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "payload too large",
    });
  });

  it("rejects oversized chunked bodies without content-length", async () => {
    const response = await POST(
      makeRequest(JSON.stringify({ message: "x".repeat(33 * 1024) })),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "payload too large",
    });
  });

  it("rejects non-object JSON", async () => {
    const response = await POST(makeRequest("[]"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "invalid JSON",
    });
  });

  it("logs bounded client error fields", async () => {
    const response = await POST(
      makeRequest(
        JSON.stringify({
          name: "TypeError",
          message: "boom",
          stack: "stack",
          url: "https://restoreassist.app/dashboard",
          userAgent: "test-agent",
          ignored: "not logged",
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(console.error).toHaveBeenCalledWith(
      "[client-error]",
      expect.stringContaining('"message":"boom"'),
    );
    expect(console.error).toHaveBeenCalledWith(
      "[client-error]",
      expect.not.stringContaining("ignored"),
    );
  });
});
