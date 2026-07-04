/**
 * RA-6984 — QuickBooksClient.getPayment
 *
 * The QBO Payment CDC webhook notification only ever carries
 * { name, id, operation, lastUpdated } — never LinkedTxn/TotalAmt (RA-6974
 * item 1 / #1699). getPayment fetches the full Payment entity by its CDC
 * entity id so the webhook processor can resolve the real settled amount.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getTokens = vi.fn();
const markIntegrationError = vi.fn();

vi.mock("@/lib/integrations/oauth-handler", () => ({
  getTokens: (...args: unknown[]) => getTokens(...args),
  storeTokens: vi.fn(),
  markIntegrationError: (...args: unknown[]) => markIntegrationError(...args),
  disconnectIntegration: vi.fn(),
  logSync: vi.fn(),
  PROVIDER_CONFIG: {
    QUICKBOOKS: {
      name: "QuickBooks",
      authUrl: "https://appcenter.intuit.com/connect/oauth2",
      tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      apiBaseUrl: "https://quickbooks.api.intuit.com/v3/company",
      scopes: ["com.intuit.quickbooks.accounting"],
      usePKCE: false,
    },
  },
}));

vi.mock("@/lib/integrations/dev-mode", () => ({
  isIntegrationDevMode: () => false,
  MOCK_CREDENTIALS: {},
}));
vi.mock("@/lib/integrations/mock-data", () => ({
  MOCK_CLIENTS: [],
  MOCK_JOBS: [],
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findUnique: vi.fn().mockResolvedValue({ realmId: "realm_1" }),
    },
  },
}));

import { QuickBooksClient } from "../client";

beforeEach(() => {
  vi.clearAllMocks();
  getTokens.mockResolvedValue({
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // valid for an hour
    isExpired: false,
  });
});

describe("QuickBooksClient.getPayment", () => {
  it("fetches the Payment entity by id and returns LinkedTxn/TotalAmt", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          Payment: {
            Id: "pay_1",
            TotalAmt: 1100,
            TxnDate: "2026-07-01",
            PaymentRefNum: "REF-1",
            Line: [
              {
                Amount: 1100,
                LinkedTxn: [{ TxnId: "inv_1", TxnType: "Invoice" }],
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new QuickBooksClient("integ_1", "realm_1");
    const payment = await client.getPayment("pay_1");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://quickbooks.api.intuit.com/v3/company/realm_1/payment/pay_1",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(payment).toEqual(
      expect.objectContaining({
        Id: "pay_1",
        TotalAmt: 1100,
        Line: [
          {
            Amount: 1100,
            LinkedTxn: [{ TxnId: "inv_1", TxnType: "Invoice" }],
          },
        ],
      }),
    );

    fetchSpy.mockRestore();
  });

  it("marks the integration in error and throws on a non-OK response", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("not found", { status: 404 }));

    const client = new QuickBooksClient("integ_1", "realm_1");

    await expect(client.getPayment("missing")).rejects.toThrow(
      /API request failed: 404/,
    );
    expect(markIntegrationError).toHaveBeenCalledWith(
      "integ_1",
      expect.stringContaining("404"),
    );

    fetchSpy.mockRestore();
  });
});
