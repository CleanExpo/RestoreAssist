/**
 * RA-6984 — MYOBClient.getCustomerPayment
 *
 * The MYOB Sale.CustomerPayment "Created" notification only ever carries the
 * raw stub { CompanyFileId, EventType, ResourceType, ResourceUID } — never
 * Amount/InvoiceUID (RA-6974 item 1 / #1699). getCustomerPayment fetches the
 * full CustomerPayment resource by its ResourceUID so the webhook processor
 * can resolve the real settled amount.
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
    MYOB: {
      name: "MYOB",
      authUrl: "https://secure.myob.com/oauth2/account/authorize",
      tokenUrl: "https://secure.myob.com/oauth2/v1/authorize",
      apiBaseUrl: "https://api.myob.com/accountright",
      scopes: ["CompanyFile"],
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
      findUnique: vi.fn().mockResolvedValue({ tenantId: "cf_1" }),
    },
  },
}));

import { MYOBClient } from "../client";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MYOB_CLIENT_ID = "test-myob-client-id";
  getTokens.mockResolvedValue({
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    isExpired: false,
  });
});

describe("MYOBClient.getCustomerPayment", () => {
  it("fetches the CustomerPayment resource by UID and returns Invoices/AmountReceived", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          UID: "payment_1",
          Date: "2026-07-01T00:00:00",
          AmountReceived: 550,
          Invoices: [
            { UID: "invoice_1", Number: "INV-1", AmountApplied: 550 },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new MYOBClient("integ_1");
    const payment = await client.getCustomerPayment("payment_1");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/Sale/CustomerPayment/payment_1"),
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(payment).toEqual(
      expect.objectContaining({
        UID: "payment_1",
        AmountReceived: 550,
        Invoices: [
          { UID: "invoice_1", Number: "INV-1", AmountApplied: 550 },
        ],
      }),
    );

    fetchSpy.mockRestore();
  });

  it("marks the integration in error and throws on a non-OK response", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("not found", { status: 404 }));

    const client = new MYOBClient("integ_1");

    await expect(client.getCustomerPayment("missing")).rejects.toThrow(
      /API request failed: 404/,
    );
    expect(markIntegrationError).toHaveBeenCalledWith(
      "integ_1",
      expect.stringContaining("404"),
    );

    fetchSpy.mockRestore();
  });
});
