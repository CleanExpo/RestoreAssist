import { describe, expect, it } from "vitest";
import { classifyIntegrationIdentity, isOAuthIntegration, getOAuthReadiness } from "../identity";

describe("integration identity independent of the legacy provider column", () => {
  it.each(["OpenAI GPT", "Anthropic Claude", "Google Gemini", "OpenRouter API"])("AI name %s wins over OAuth evidence", name => {
    const row = { provider: "XERO", name, icon: "/integrations/xero.svg", tenantId: "synthetic-org" };
    expect(classifyIntegrationIdentity(row).kind).toBe("AI");
    expect(isOAuthIntegration(row, "XERO")).toBe(false);
  });
  it.each([{ icon: "[ra:ai]" }, { config: JSON.stringify({ apiKeyType: "anthropic" }) }, { config: JSON.stringify(JSON.stringify({ apiKeyType: "anthropic" })) }])("AI markers win even with a custom name", evidence => {
    expect(isOAuthIntegration({ provider: "XERO", name: "Xero", ...evidence })).toBe(false);
  });
  it("preserves pending canonical OAuth and genuine custom organisation names", () => {
    expect(isOAuthIntegration({ provider: "XERO", name: "Xero", icon: null })).toBe(true);
    expect(isOAuthIntegration({ provider: "XERO", name: "Our accounts", icon: null, tenantId: "synthetic-org" })).toBe(true);
    expect(isOAuthIntegration({ provider: "QUICKBOOKS", name: "Custom", icon: "/integrations/quickbooks.svg" })).toBe(true);
  });
  it("refuses ambiguous legacy, unsupported and cross-provider identities", () => {
    expect(isOAuthIntegration({ provider: "XERO", name: "Unknown", icon: null })).toBe(false);
    expect(isOAuthIntegration({ provider: "ASCORA", name: "Ascora" })).toBe(false);
    expect(isOAuthIntegration({ provider: "XERO", name: "Xero" }, "QUICKBOOKS")).toBe(false);
  });
  it("separates configured identity from readiness", () => {
    const row = { provider: "XERO", name: "Xero", status: "CONNECTED", hasOAuthCredentials: true };
    expect(getOAuthReadiness(row)).toEqual({ ready: false, reason: "ORGANISATION_REQUIRED" });
    expect(getOAuthReadiness({ ...row, tenantId: "synthetic-org" })).toEqual({ ready: true });
    expect(getOAuthReadiness({ ...row, tenantId: "  " }).ready).toBe(false);
    expect(getOAuthReadiness({ ...row, tenantId: "synthetic-org", hasOAuthCredentials: undefined, accessToken: "  " }).ready).toBe(false);
    expect(getOAuthReadiness({ ...row, tenantId: "synthetic-org", hasOAuthCredentials: false }).ready).toBe(false);
    expect(getOAuthReadiness({ ...row, tenantId: "synthetic-org", status: "DISCONNECTED" }).ready).toBe(false);
    expect(getOAuthReadiness({ ...row, tenantId: "synthetic-org", name: "OpenAI GPT" }).ready).toBe(false);
  });
});
