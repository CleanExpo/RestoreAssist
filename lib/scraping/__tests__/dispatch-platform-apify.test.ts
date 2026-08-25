import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchViaApify = vi.fn();
const resolveApifyToken = vi.fn();
const getActiveScrapingProvider = vi.fn();
const workspaceFindFirst = vi.fn();
const memberFindFirst = vi.fn();

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
    workspace: { findFirst: (...args: unknown[]) => workspaceFindFirst(...args) },
    workspaceMember: {
      findFirst: (...args: unknown[]) => memberFindFirst(...args),
    },
    scrapingProviderConnection: { updateMany: vi.fn() },
  },
}));

import { fetchHtmlViaWorkspaceProvider } from "../dispatch";

describe("fetchHtmlViaWorkspaceProvider — platform Apify", () => {
  beforeEach(() => {
    fetchViaApify.mockReset();
    resolveApifyToken.mockReset();
    getActiveScrapingProvider.mockReset();
    workspaceFindFirst.mockReset();
    memberFindFirst.mockReset();
    workspaceFindFirst.mockResolvedValue(null);
    memberFindFirst.mockResolvedValue(null);
  });

  it("uses the platform Apify token when the workspace has no BYOK provider", async () => {
    resolveApifyToken.mockReturnValue("platform-token");
    fetchViaApify.mockResolvedValue({ html: "<html>plan</html>", status: 200 });
    const sharedFetch = vi.fn();

    const result = await fetchHtmlViaWorkspaceProvider(
      "https://www.onthehouse.com.au/x",
      "user-1",
      sharedFetch,
    );

    expect(result).toEqual({
      html: "<html>plan</html>",
      status: 200,
      providerUsed: "APIFY",
      fellBack: false,
    });
    expect(fetchViaApify).toHaveBeenCalledWith(
      "https://www.onthehouse.com.au/x",
      "platform-token",
    );
    expect(sharedFetch).not.toHaveBeenCalled();
  });

  it("falls back to direct fetch when platform Apify fails", async () => {
    resolveApifyToken.mockReturnValue("platform-token");
    fetchViaApify.mockRejectedValue(new Error("Apify run failed: HTTP 500"));
    const sharedFetch = vi.fn().mockResolvedValue({ html: "", status: 403 });

    const result = await fetchHtmlViaWorkspaceProvider(
      "https://www.domain.com.au/x",
      "user-1",
      sharedFetch,
    );

    expect(result.providerUsed).toBe("SHARED");
    expect(result.fellBack).toBe(true);
    expect(sharedFetch).toHaveBeenCalledOnce();
  });
});
