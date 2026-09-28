/**
 * RA-7721 — platform Firecrawl key (FIRECRAWL_API_KEY) in scraping dispatch.
 *
 * Order when no BYOK provider: platform Apify → platform Firecrawl → SHARED.
 * A workspace BYOK provider always wins and still fails closed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchViaApify = vi.fn();
const resolveApifyToken = vi.fn();
const fetchViaFirecrawl = vi.fn();
const resolveFirecrawlKey = vi.fn();
const getActiveScrapingProvider = vi.fn();
const workspaceFindFirst = vi.fn();
const memberFindFirst = vi.fn();

vi.mock("../providers/apify", () => ({
  fetchViaApify: (...args: unknown[]) => fetchViaApify(...args),
  resolveApifyToken: (...args: unknown[]) => resolveApifyToken(...args),
}));

vi.mock("../providers/firecrawl", () => ({
  fetchViaFirecrawl: (...args: unknown[]) => fetchViaFirecrawl(...args),
  resolveFirecrawlKey: (...args: unknown[]) => resolveFirecrawlKey(...args),
}));

vi.mock("@/lib/workspace/scraping-provider-connections", () => ({
  getActiveScrapingProvider: (...args: unknown[]) =>
    getActiveScrapingProvider(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      findFirst: (...args: unknown[]) => workspaceFindFirst(...args),
    },
    workspaceMember: {
      findFirst: (...args: unknown[]) => memberFindFirst(...args),
    },
    scrapingProviderConnection: { updateMany: vi.fn() },
  },
}));

import { fetchHtmlViaWorkspaceProvider } from "../dispatch";

const PLATFORM_KEY = "fc-platform-test-key-7721";
const URL = "https://www.onthehouse.com.au/x";

describe("fetchHtmlViaWorkspaceProvider — platform Firecrawl", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const m of [
      fetchViaApify,
      resolveApifyToken,
      fetchViaFirecrawl,
      resolveFirecrawlKey,
      getActiveScrapingProvider,
      workspaceFindFirst,
      memberFindFirst,
    ]) {
      m.mockReset();
    }
    workspaceFindFirst.mockResolvedValue(null);
    memberFindFirst.mockResolvedValue(null);
    resolveApifyToken.mockReturnValue(null);
    resolveFirecrawlKey.mockReturnValue(null);
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
    log = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
    log.mockRestore();
  });

  function loggedText(): string {
    return [warn, error, log]
      .flatMap((s) => s.mock.calls)
      .map((args) =>
        args
          .map((a: unknown) =>
            a instanceof Error ? `${a.message} ${a.stack}` : String(a),
          )
          .join(" "),
      )
      .join("\n");
  }

  it("unset key: uses SHARED and never calls Firecrawl (identical to today)", async () => {
    const sharedFetch = vi
      .fn()
      .mockResolvedValue({ html: "<html>s</html>", status: 200 });

    const result = await fetchHtmlViaWorkspaceProvider(URL, "user-1", sharedFetch);

    expect(result).toEqual({
      html: "<html>s</html>",
      status: 200,
      providerUsed: "SHARED",
      fellBack: false,
    });
    expect(fetchViaFirecrawl).not.toHaveBeenCalled();
    expect(sharedFetch).toHaveBeenCalledOnce();
  });

  it("key set + no BYOK: routes through Firecrawl with the platform key", async () => {
    resolveFirecrawlKey.mockReturnValue(PLATFORM_KEY);
    fetchViaFirecrawl.mockResolvedValue({ html: "<html>fc</html>", status: 200 });
    const sharedFetch = vi.fn();

    const result = await fetchHtmlViaWorkspaceProvider(URL, "user-1", sharedFetch);

    expect(result).toEqual({
      html: "<html>fc</html>",
      status: 200,
      providerUsed: "FIRECRAWL",
      fellBack: false,
    });
    expect(fetchViaFirecrawl).toHaveBeenCalledWith(URL, PLATFORM_KEY);
    expect(sharedFetch).not.toHaveBeenCalled();
  });

  it("key set + workspace provider = SHARED: still uses platform Firecrawl", async () => {
    workspaceFindFirst.mockResolvedValue({ id: "workspace-1" });
    getActiveScrapingProvider.mockResolvedValue({
      provider: "SHARED",
      apiKey: "",
      config: null,
    });
    resolveFirecrawlKey.mockReturnValue(PLATFORM_KEY);
    fetchViaFirecrawl.mockResolvedValue({ html: "<html>fc</html>", status: 200 });
    const sharedFetch = vi.fn();

    const result = await fetchHtmlViaWorkspaceProvider(URL, "user-1", sharedFetch);

    expect(result.providerUsed).toBe("FIRECRAWL");
    expect(fetchViaFirecrawl).toHaveBeenCalledWith(URL, PLATFORM_KEY);
    expect(sharedFetch).not.toHaveBeenCalled();
  });

  it("platform Firecrawl throws: falls back to SHARED with fellBack true", async () => {
    resolveFirecrawlKey.mockReturnValue(PLATFORM_KEY);
    fetchViaFirecrawl.mockRejectedValue(
      new Error("Firecrawl scrape failed: HTTP 402"),
    );
    const sharedFetch = vi.fn().mockResolvedValue({ html: "", status: 403 });

    const result = await fetchHtmlViaWorkspaceProvider(URL, "user-1", sharedFetch);

    expect(result).toEqual({
      html: "",
      status: 403,
      providerUsed: "SHARED",
      fellBack: true,
    });
    expect(fetchViaFirecrawl).toHaveBeenCalledOnce();
    expect(sharedFetch).toHaveBeenCalledOnce();
  });

  it("BYOK provider configured: BYOK used, platform Firecrawl key ignored, still fails closed", async () => {
    workspaceFindFirst.mockResolvedValue({ id: "workspace-1" });
    getActiveScrapingProvider.mockResolvedValue({
      provider: "ZYTE",
      apiKey: "workspace-zyte-key",
      config: null,
    });
    resolveFirecrawlKey.mockReturnValue(PLATFORM_KEY);
    const sharedFetch = vi.fn();

    // ZYTE adapter is real here but fetch is stubbed to fail → must 503, not reroute.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("zyte down"));
    try {
      const result = await fetchHtmlViaWorkspaceProvider(URL, "user-1", sharedFetch);
      expect(result).toMatchObject({
        html: "",
        status: 503,
        providerUsed: "ZYTE",
        fellBack: false,
      });
    } finally {
      fetchSpy.mockRestore();
    }
    expect(fetchViaFirecrawl).not.toHaveBeenCalled();
    expect(sharedFetch).not.toHaveBeenCalled();
  });

  it("BYOK FIRECRAWL uses the workspace key, never the platform key", async () => {
    workspaceFindFirst.mockResolvedValue({ id: "workspace-1" });
    getActiveScrapingProvider.mockResolvedValue({
      provider: "FIRECRAWL",
      apiKey: "fc-workspace-key",
      config: null,
    });
    resolveFirecrawlKey.mockReturnValue(PLATFORM_KEY);
    fetchViaFirecrawl.mockResolvedValue({ html: "<html>w</html>", status: 200 });
    const sharedFetch = vi.fn();

    const result = await fetchHtmlViaWorkspaceProvider(URL, "user-1", sharedFetch);

    expect(result.providerUsed).toBe("FIRECRAWL");
    expect(fetchViaFirecrawl).toHaveBeenCalledTimes(1);
    expect(fetchViaFirecrawl).toHaveBeenCalledWith(URL, "fc-workspace-key");
  });

  it("both platform Apify and Firecrawl set: Apify first, Firecrawl serves after Apify throws (fellBack true)", async () => {
    resolveApifyToken.mockReturnValue("apify-platform");
    fetchViaApify.mockRejectedValue(new Error("Apify run failed: HTTP 500"));
    resolveFirecrawlKey.mockReturnValue(PLATFORM_KEY);
    fetchViaFirecrawl.mockResolvedValue({ html: "<html>fc</html>", status: 200 });
    const sharedFetch = vi.fn();

    const result = await fetchHtmlViaWorkspaceProvider(URL, "user-1", sharedFetch);

    expect(result).toEqual({
      html: "<html>fc</html>",
      status: 200,
      providerUsed: "FIRECRAWL",
      fellBack: true,
    });
    expect(sharedFetch).not.toHaveBeenCalled();
  });

  it("never writes the platform key into any log line, even when the provider echoes it", async () => {
    resolveFirecrawlKey.mockReturnValue(PLATFORM_KEY);
    fetchViaFirecrawl.mockRejectedValue(
      new Error(`Firecrawl error: invalid token ${PLATFORM_KEY}`),
    );
    const sharedFetch = vi.fn().mockResolvedValue({ html: "", status: 403 });

    const result = await fetchHtmlViaWorkspaceProvider(URL, "user-1", sharedFetch);

    // Precondition: the failure path actually logged something, so an
    // absent key means redaction — not silence.
    expect(warn).toHaveBeenCalled();
    expect(loggedText()).toContain("[redacted]");
    expect(loggedText()).not.toContain(PLATFORM_KEY);
    expect(JSON.stringify(result)).not.toContain(PLATFORM_KEY);
  });
});
