import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { byokDispatch } from "../byok-client";
import { scrubSecretQueryParams } from "../../sentry-scrub";

describe("scrubSecretQueryParams — Sentry URL scrub (B4)", () => {
  it("redacts secret query params while leaving others intact", () => {
    expect(scrubSecretQueryParams("https://x/a?key=AIzaSECRET&b=1")).toBe(
      "https://x/a?key=[REDACTED]&b=1",
    );
    expect(scrubSecretQueryParams("https://x/a?apiKey=sk-secret")).toBe(
      "https://x/a?apiKey=[REDACTED]",
    );
    expect(scrubSecretQueryParams("https://x/a?b=1&c=2")).toBe(
      "https://x/a?b=1&c=2",
    );
  });
});

describe("callGoogle via byokDispatch — key in header, never URL (B4)", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "ok" }] } }],
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("sends the Gemini key via x-goog-api-key header and never in the URL", async () => {
    await byokDispatch({
      model: "gemini-3.1-flash",
      apiKey: "AIzaSECRETKEY",
      systemPrompt: "sys",
      userPrompt: "hi",
    });

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).not.toContain("AIzaSECRETKEY");
    expect(String(url)).not.toContain("key=");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "AIzaSECRETKEY",
    );
  });
});
