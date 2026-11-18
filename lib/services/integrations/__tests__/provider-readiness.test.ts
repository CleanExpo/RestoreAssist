/**
 * RA-8445 — per-provider connection state for the metrics API comes from the
 * readiness owner (describeOAuthCard -> getOAuthReadiness), never from the raw
 * Integration.status column.
 */

import { describe, expect, it } from "vitest";
import { describeProviderReadiness } from "../provider-readiness";
import type { LegacyIntegrationMetadata } from "../display";

function row(over: Partial<LegacyIntegrationMetadata>): LegacyIntegrationMetadata {
  return {
    id: "i_1",
    provider: "XERO",
    name: "Xero",
    status: "CONNECTED",
    tenantId: "tenant-1",
    hasOAuthCredentials: true,
    ...over,
  };
}

describe("describeProviderReadiness", () => {
  it("does not call a CONNECTED Xero row with no organisation connected", () => {
    const result = describeProviderReadiness([row({ tenantId: null })], false);
    expect(result.XERO.connected).toBe(false);
    expect(result.XERO.status).toBe("ATTENTION");
    expect(result.XERO.attention).toMatch(/organisation/i);
  });

  it("does not call a CONNECTED QuickBooks row with no realm connected", () => {
    const result = describeProviderReadiness(
      [row({ id: "q", provider: "QUICKBOOKS", name: "QuickBooks", tenantId: null, realmId: null })],
      false,
    );
    expect(result.QUICKBOOKS.connected).toBe(false);
  });

  it("does not call a CONNECTED row without stored credentials connected", () => {
    const result = describeProviderReadiness([row({ hasOAuthCredentials: false })], false);
    expect(result.XERO.connected).toBe(false);
  });

  it("still calls a fully ready row connected", () => {
    const result = describeProviderReadiness([row({})], false);
    expect(result.XERO).toEqual({ status: "CONNECTED", connected: true, attention: null });
  });

  it("keeps a ready ERROR row connected and reports the ERROR state", () => {
    const result = describeProviderReadiness([row({ status: "ERROR" })], false);
    expect(result.XERO).toMatchObject({ status: "ERROR", connected: true });
  });

  it("does not let an AI key row labelled XERO stand in for a Xero connection", () => {
    const result = describeProviderReadiness(
      [row({ name: "OpenAI GPT", icon: "[ra:ai]", tenantId: null })],
      false,
    );
    expect(result.XERO.connected).toBe(false);
  });

  it("reports UNAVAILABLE rather than a verdict when the row list was truncated", () => {
    const result = describeProviderReadiness([row({})], true);
    expect(result.XERO).toMatchObject({ status: "UNAVAILABLE", connected: false });
  });

  it("makes no readiness claim for a provider the owner does not cover", () => {
    const result = describeProviderReadiness(
      [row({ id: "a", provider: "ASCORA", name: "Ascora", tenantId: null })],
      false,
    );
    expect(result.ASCORA).toEqual({ status: "CONNECTED", connected: null, attention: null });
  });

  it("only lists providers that have a row", () => {
    expect(Object.keys(describeProviderReadiness([row({})], false))).toEqual(["XERO"]);
  });
});
