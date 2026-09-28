/**
 * RA-7721 — platform Firecrawl wired end to end from process.env.
 *
 * The real resolveFirecrawlKey and the real Firecrawl adapter run here; only
 * the network (globalThis.fetch) is intercepted. This guards the production
 * wiring that the mocked dispatch suite cannot see: the resolver must read
 * process.env by default, and dispatch must hand that exact key to Firecrawl.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveApifyToken = vi.fn();
const fetchViaApify = vi.fn();
const getActiveScrapingProvider = vi.fn();

vi.mock("../providers/apify", () => ({
  fetchViaApify: (...args: unknown[]) => fetchViaApify(...args),
  resolveApifyToken: (...args: unknown[]) => resolveApifyToken(...args),
}));

vi.mock("@/lib/workspace/scraping-provider-connections", () => ({
  getActiveScrapingProvider: (...args: unknown[]) =>
    getActiveScrapingProvider(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: { findFirst: vi.fn().mockResolvedValue(null) },
    workspaceMember: { findFirst: vi.fn().mockResolvedValue(null) },
    scrapingProviderConnection: { updateMany: vi.fn() },
  },
}));

import { fetchHtmlViaWorkspaceProvider } from "../dispatch";

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape";
const TARGET = "https://www.onthehouse.com.au/x";

describe("fetchHtmlViaWorkspaceProvider — platform Firecrawl from process.env", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resolveApifyToken.mockReset().mockReturnValue(null);
    fetchViaApify.mockReset();
    getActiveScrapingProvider.mockReset();
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { html: "<html>fc</html>", metadata: { statusCode: 200 } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("FIRECRAWL_API_KEY set: calls Firecrawl with exactly that key", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-key");
    const sharedFetch = vi.fn();

    const result = await fetchHtmlViaWorkspaceProvider(TARGET, "user-1", sharedFetch);

    expect(result).toEqual({
      html: "<html>fc</html>",
      status: 200,
      providerUsed: "FIRECRAWL",
      fellBack: false,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe(FIRECRAWL_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer fc-test-key",
    );
    expect(JSON.parse(String(init.body)).url).toBe(TARGET);
    expect(sharedFetch).not.toHaveBeenCalled();
  });

  it("FIRECRAWL_API_KEY unset: Firecrawl is never called, shared fetch serves", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", undefined);
    const sharedFetch = vi
      .fn()
      .mockResolvedValue({ html: "<html>s</html>", status: 200 });

    const result = await fetchHtmlViaWorkspaceProvider(TARGET, "user-1", sharedFetch);

    expect(result).toEqual({
      html: "<html>s</html>",
      status: 200,
      providerUsed: "SHARED",
      fellBack: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sharedFetch).toHaveBeenCalledOnce();
  });
});
