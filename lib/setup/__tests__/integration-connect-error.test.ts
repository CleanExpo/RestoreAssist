import { describe, expect, it } from "vitest";
import {
  integrationConnectFailure,
  SUBSCRIPTION_URL,
} from "../integration-connect-error";
import { BOOKKEEPING_ADDON } from "@/lib/billing/bookkeeping-addon";
import { SERVICE_CRM_ADDON } from "@/lib/billing/service-crm-addon";

describe("integrationConnectFailure", () => {
  it("names the add-on and links to it for a 402 ADDON_REQUIRED", () => {
    // The exact body `requireAddon` returns for a workspace with no
    // BOOKKEEPING entitlement — the case every fresh workspace hits.
    const result = integrationConnectFailure(
      402,
      {
        error: 'The "BOOKKEEPING" add-on is required for this feature',
        code: "ADDON_REQUIRED",
        sku: "BOOKKEEPING",
        action: "upgrade",
        redirectUrl: "/dashboard/subscription",
      },
      "Xero",
    );

    expect(result.message).toContain("Xero");
    expect(result.message).toContain(BOOKKEEPING_ADDON.name);
    expect(result.action).toEqual({ label: "View add-ons", href: SUBSCRIPTION_URL });
  });

  it("names the Service CRM add-on when that is the blocking SKU", () => {
    const result = integrationConnectFailure(
      402,
      { code: "ADDON_REQUIRED", sku: "SERVICE_CRM", redirectUrl: "/dashboard/subscription" },
      "Ascora",
    );
    expect(result.message).toContain(SERVICE_CRM_ADDON.name);
  });

  it("sends a workspace-less user to a real subscription page on a 402 NO_WORKSPACE", () => {
    const result = integrationConnectFailure(
      402,
      {
        error: "No workspace found — subscription required",
        code: "NO_WORKSPACE",
        sku: "BOOKKEEPING",
        action: "subscribe",
        redirectUrl: "/subscribe",
      },
      "QuickBooks",
    );

    expect(result.message).toContain("QuickBooks");
    expect(result.message).toContain("subscription");
    // requireAddon's own redirectUrl for this branch is "/subscribe", which is
    // NOT a route in this app — following it would 404 the operator.
    expect(result.action).toEqual({ label: "Choose a plan", href: SUBSCRIPTION_URL });
  });

  it("uses the operator-facing `message` from the 403 subscription gate, not `error`", () => {
    // createSubscriptionRequiredResponse puts the terse half in `error` and
    // the sentence written for operators in `message`.
    const result = integrationConnectFailure(
      403,
      {
        error: "Subscription required",
        upgradeRequired: true,
        currentStatus: "TRIALING",
        message:
          "External integrations are available for paid subscribers. Please upgrade your plan to connect to Xero, QuickBooks, MYOB, ServiceM8, or Ascora.",
      },
      "MYOB",
    );

    expect(result.message).toContain("available for paid subscribers");
    expect(result.action).toEqual({ label: "View plans", href: SUBSCRIPTION_URL });
  });

  it("falls back to a plan sentence when the 403 carries no message", () => {
    const result = integrationConnectFailure(
      403,
      { error: "Subscription required", upgradeRequired: true },
      "MYOB",
    );
    expect(result.message).toBe("MYOB is available on paid plans.");
    expect(result.action?.href).toBe(SUBSCRIPTION_URL);
  });

  it("tells the operator to sign in again on a 401", () => {
    const result = integrationConnectFailure(
      401,
      { error: { code: "UNAUTHORIZED", message: "Unauthorized", eventId: "e1" } },
      "Xero",
    );
    expect(result.message).toMatch(/sign in again/i);
    expect(result.message).toContain("Xero");
    // "Unauthorized" is not an instruction — it must not be what we show.
    expect(result.message).not.toBe("Unauthorized");
    expect(result.action).toBeUndefined();
  });

  it("does not leak the internal reason on a 5xx", () => {
    const result = integrationConnectFailure(
      500,
      {
        error: {
          code: "INTERNAL",
          message: "XERO_CLIENT_ID is not configured",
          eventId: "e2",
        },
      },
      "Xero",
    );
    expect(result.message).not.toContain("XERO_CLIENT_ID");
    expect(result.message).toMatch(/isn't available right now/i);
  });

  it("surfaces the nested apiError message for a 400", () => {
    const result = integrationConnectFailure(
      400,
      {
        error: {
          code: "VALIDATION",
          message:
            "Ascora does not use OAuth. Use /api/ascora/connect, which enforces the Service CRM add-on and verifies the API key.",
          eventId: "e3",
        },
      },
      "Ascora",
    );
    expect(result.message).toContain("does not use OAuth");
  });

  it("never returns an object as the message, whatever the envelope", () => {
    // The RA-1548 envelope handed to React as a child throws
    // "Objects are not valid as a React child".
    for (const body of [
      { error: { code: "X", message: "boom" } },
      { error: "flat string" },
      { error: {} },
      null,
      "not json at all",
      42,
    ]) {
      const result = integrationConnectFailure(418, body, "Xero");
      expect(typeof result.message).toBe("string");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("never links to a server-supplied redirectUrl", () => {
    // The link target is the wizard's own decision: the server's redirectUrl
    // is written for the dashboard context (and already carries a 404), and
    // an attacker-controllable href is a class of bug worth not having.
    const supplied = [
      "https://evil.example/steal",
      "//evil.example/steal",
      "/subscribe",
      "javascript:alert(1)",
    ];
    for (const redirectUrl of supplied) {
      const result = integrationConnectFailure(
        402,
        { code: "ADDON_REQUIRED", sku: "BOOKKEEPING", redirectUrl },
        "Xero",
      );
      expect(result.action?.href).toBe(SUBSCRIPTION_URL);
    }
  });

  it("only ever links to a path the setup gate lets through", () => {
    // proxy.ts SETUP_GATE_BYPASS must contain this prefix, or the link 307s
    // back to /setup the moment SETUP_WIZARD_ENABLED is turned on.
    expect(SUBSCRIPTION_URL).toBe("/dashboard/subscription");
  });

  it("names the provider and the status when nothing else is recognisable", () => {
    const result = integrationConnectFailure(409, {}, "ServiceM8");
    expect(result.message).toContain("ServiceM8");
    expect(result.message).toContain("409");
  });
});
