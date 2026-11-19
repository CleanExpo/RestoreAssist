import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: { findUnique: vi.fn() },
  },
}));

vi.mock("../oauth-handler", () => ({
  getTokens: vi.fn(),
}));

import { getTokens } from "../oauth-handler";
import { isOAuthLiveProbeEnabled, probeOAuthIntegrations } from "../oauth-live-probe";

describe("oauth-live-probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.INTEGRATIONS_OAUTH_PROBE;
  });

  it("is enabled by default", () => {
    expect(isOAuthLiveProbeEnabled()).toBe(true);
  });

  it("can be disabled with INTEGRATIONS_OAUTH_PROBE=0", () => {
    process.env.INTEGRATIONS_OAUTH_PROBE = "0";
    expect(isOAuthLiveProbeEnabled()).toBe(false);
  });

  it("probes Xero connections when token is present", async () => {
    const getTokensMock = getTokens as unknown as ReturnType<typeof vi.fn>;
    getTokensMock.mockResolvedValue({ accessToken: "tok" });

    global.fetch = vi.fn().mockResolvedValue(
      new Response("[]", { status: 200 }),
    ) as typeof fetch;

    const results = await probeOAuthIntegrations([
      { id: "int_1", provider: "XERO" },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.xero.com/connections",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
        }),
      }),
    );
  });

  it("skips non-OAuth providers", async () => {
    const results = await probeOAuthIntegrations([
      { id: "int_1", provider: "ASCORA" },
    ]);
    expect(results).toHaveLength(0);
  });
});