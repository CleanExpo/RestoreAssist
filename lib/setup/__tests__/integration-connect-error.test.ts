import { describe, expect, it } from "vitest";
import {
  ADDONS_URL,
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
    expect(result.action).toEqual({ label: "View add-ons", href: ADDONS_URL });
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

  it.each([
    [402, { code: "SOMETHING_NEW", sku: "BOOKKEEPING" }],
    [403, { error: "Forbidden" }],
    [403, { error: "Forbidden", upgradeRequired: false }],
  ])("uses the generic fallback for an unrecognised %i response", (status, body) => {
    const result = integrationConnectFailure(status, body, "Xero");
    expect(result.message).toBe(`Couldn't connect Xero (${status}). Try again, or connect it later from Settings.`);
    expect(result.action).toBeUndefined();
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
      expect(result.action?.href).toBe(ADDONS_URL);
    }
  });

  it("pins the billing destination constant", () => {
    // Only the constant's value — that this path is actually let through by
    // the setup gate is pinned in middleware-setup-gate.test.ts, which is the
    // suite that can see proxy.ts. Naming this test after the gate property
    // would be naming something it cannot detect.
    expect(SUBSCRIPTION_URL).toBe("/dashboard/subscription");
    expect(ADDONS_URL).toBe("/dashboard/addons");
  });

  it("names the provider and the status when nothing else is recognisable", () => {
    const result = integrationConnectFailure(409, {}, "ServiceM8");
    expect(result.message).toContain("ServiceM8");
    expect(result.message).toContain("409");
  });
  // ── Drained from independent review 2026-08-18 ──────────────────────────

  it("does not read an unknown SKU off Object.prototype", () => {
    // `ADDON_LABEL[sku]` on a plain object literal resolves these to a
    // prototype member — an object or a function — which would interpolate
    // into the sentence handed to the operator.
    for (const sku of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      const result = integrationConnectFailure(
        402,
        { code: "ADDON_REQUIRED", sku },
        "Xero",
      );
      expect(result.message).toBe(
        "Xero needs the required add-on before it can connect.",
      );
      expect(result.message).not.toContain("[object");
      expect(result.message).not.toContain("function");
    }
  });

  it("does not offer to sell an add-on during a server fault", () => {
    // Dispatch must consult `status`, not just the body keys: a wrapped 5xx
    // carrying `code: "ADDON_REQUIRED"` is a fault, not a paywall.
    const result = integrationConnectFailure(
      500,
      { code: "ADDON_REQUIRED", sku: "BOOKKEEPING" },
      "Xero",
    );
    expect(result.message).toMatch(/isn't available right now/i);
    expect(result.action).toBeUndefined();
  });

  // Each row asserts the branch the status DEMANDS, not merely "not the
  // add-on sentence" — a body-key-driven mutant for NO_WORKSPACE or the 403
  // gate survives that weaker assertion, because neither of their sentences
  // contains the add-on wording.
  it.each([
    [500, { code: "NO_WORKSPACE" }, /isn't available right now/i],
    [500, { upgradeRequired: true, message: "Upgrade your plan." }, /isn't available right now/i],
    [500, { code: "ADDON_REQUIRED", sku: "BOOKKEEPING" }, /isn't available right now/i],
    [400, { code: "NO_WORKSPACE" }, /Couldn't connect Xero \(400\)/],
    [400, { upgradeRequired: true, message: "Upgrade your plan." }, /Couldn't connect Xero \(400\)/],
  ])(
    "takes the branch the status demands, not the one the body keys suggest (%i)",
    (status, body, expected) => {
      const result = integrationConnectFailure(status, body, "Xero");
      expect(result.message).toMatch(expected);
      // A fault or an unrecognised rejection offers no upgrade action.
      expect(result.action).toBeUndefined();
    },
  );
});
