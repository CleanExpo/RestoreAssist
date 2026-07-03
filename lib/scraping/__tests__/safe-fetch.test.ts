/**
 * RA-6940 — SSRF-safe redirect handling for the property scraper.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchWithValidatedRedirect,
  isAllowedScrapeUrl,
} from "../safe-fetch";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function redirectResponse(status: number, location?: string): Response {
  return new Response(null, {
    status,
    headers: location ? { location } : {},
  });
}

describe("isAllowedScrapeUrl", () => {
  it("allows https onthehouse and domain hosts", () => {
    expect(isAllowedScrapeUrl("https://www.onthehouse.com.au/x")).toBe(true);
    expect(isAllowedScrapeUrl("https://onthehouse.com.au/x")).toBe(true);
    expect(isAllowedScrapeUrl("https://www.domain.com.au/x")).toBe(true);
    expect(isAllowedScrapeUrl("https://domain.com.au/x")).toBe(true);
  });

  it("rejects other hosts, http, lookalikes and garbage", () => {
    expect(isAllowedScrapeUrl("https://evil.example.com/")).toBe(false);
    expect(isAllowedScrapeUrl("http://www.onthehouse.com.au/")).toBe(false);
    expect(isAllowedScrapeUrl("https://onthehouse.com.au.evil.com/")).toBe(
      false,
    );
    expect(isAllowedScrapeUrl("https://169.254.169.254/latest/meta-data")).toBe(
      false,
    );
    expect(isAllowedScrapeUrl("not a url")).toBe(false);
  });
});

describe("fetchWithValidatedRedirect", () => {
  it("fetches with redirect: manual and returns non-redirect responses as-is", async () => {
    const ok = new Response("<html></html>", { status: 200 });
    fetchMock.mockResolvedValueOnce(ok);

    const res = await fetchWithValidatedRedirect(
      "https://www.onthehouse.com.au/search",
      {},
    );

    expect(res).toBe(ok);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("follows one redirect to an allowlisted host", async () => {
    const ok = new Response("<html>listing</html>", { status: 200 });
    fetchMock
      .mockResolvedValueOnce(
        redirectResponse(301, "https://www.onthehouse.com.au/property/1"),
      )
      .mockResolvedValueOnce(ok);

    const res = await fetchWithValidatedRedirect(
      "https://onthehouse.com.au/property/1",
      {},
    );

    expect(res).toBe(ok);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://www.onthehouse.com.au/property/1",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ redirect: "manual" });
  });

  it("resolves relative Location headers against the original URL", async () => {
    const ok = new Response("ok", { status: 200 });
    fetchMock
      .mockResolvedValueOnce(redirectResponse(302, "/property/2"))
      .mockResolvedValueOnce(ok);

    await fetchWithValidatedRedirect(
      "https://www.domain.com.au/sale/?q=x",
      {},
    );

    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://www.domain.com.au/property/2",
    );
  });

  it("refuses a redirect to a non-allowlisted host (SSRF)", async () => {
    fetchMock.mockResolvedValueOnce(
      redirectResponse(302, "http://169.254.169.254/latest/meta-data"),
    );

    await expect(
      fetchWithValidatedRedirect("https://www.onthehouse.com.au/search", {}),
    ).rejects.toThrow(/disallowed target/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect that downgrades to http on an allowlisted host", async () => {
    fetchMock.mockResolvedValueOnce(
      redirectResponse(302, "http://www.onthehouse.com.au/property/1"),
    );

    await expect(
      fetchWithValidatedRedirect("https://www.onthehouse.com.au/search", {}),
    ).rejects.toThrow(/disallowed target/);
  });

  it("refuses a redirect with no Location header", async () => {
    fetchMock.mockResolvedValueOnce(redirectResponse(301));

    await expect(
      fetchWithValidatedRedirect("https://www.onthehouse.com.au/search", {}),
    ).rejects.toThrow(/without a Location/);
  });

  it("refuses a second redirect hop", async () => {
    fetchMock
      .mockResolvedValueOnce(
        redirectResponse(301, "https://www.onthehouse.com.au/a"),
      )
      .mockResolvedValueOnce(
        redirectResponse(302, "https://www.onthehouse.com.au/b"),
      );

    await expect(
      fetchWithValidatedRedirect("https://onthehouse.com.au/search", {}),
    ).rejects.toThrow(/second redirect/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
