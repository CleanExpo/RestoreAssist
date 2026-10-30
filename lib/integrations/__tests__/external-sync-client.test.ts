import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  externalSyncEndpoint,
  formatExternalSyncSuccessMessage,
  integrationProviderToSlug,
  runExternalIntegrationSync,
} from "../external-sync-client";

describe("external-sync-client (RA-8094)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps integration provider strings to OAuth slugs", () => {
    expect(integrationProviderToSlug("XERO")).toBe("xero");
    expect(integrationProviderToSlug("quickbooks")).toBe("quickbooks");
    expect(integrationProviderToSlug("unknown")).toBeNull();
  });

  it("uses OAuth sync routes (not nir-sync)", () => {
    expect(externalSyncEndpoint("xero")).toBe(
      "/api/integrations/oauth/xero/sync",
    );
    expect(externalSyncEndpoint("ascora")).toBe("/api/ascora/sync");
  });

  it("formats OAuth sync success counts", () => {
    expect(
      formatExternalSyncSuccessMessage("xero", {
        clientsSynced: 2,
        jobsSynced: 5,
      }),
    ).toBe("Synced 2 clients and 5 jobs");
  });

  it("surfaces structured API error messages on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: "VALIDATION", message: "Token expired" },
        }),
      }),
    );

    const result = await runExternalIntegrationSync("xero");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Token expired");
    expect(fetch).toHaveBeenCalledWith(
      "/api/integrations/oauth/xero/sync",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ syncClients: true, syncJobs: true }),
      }),
    );
  });
});
