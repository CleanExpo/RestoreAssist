/**
 * Wave 3 (W3-5) — lightweight upstream reachability checks for connected OAuth
 * integrations. Uses stored tokens only; does not mutate integration rows.
 */

import { prisma } from "@/lib/prisma";
import { getTokens } from "./oauth-handler";
import { OAUTH_PROVIDERS, type OAuthProvider } from "./identity";

const PROBE_TIMEOUT_MS = 5_000;

export type OAuthProbeResult = {
  provider: string;
  ok: boolean;
  httpStatus?: number;
  error?: string;
};

function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
}

async function probeOne(
  integrationId: string,
  provider: OAuthProvider,
): Promise<OAuthProbeResult> {
  try {
    const tokens = await getTokens(integrationId, provider);
    if (!tokens.accessToken) {
      return { provider, ok: false, error: "no access token" };
    }

    const headers = {
      Authorization: `Bearer ${tokens.accessToken}`,
      Accept: "application/json",
    };

    if (provider === "XERO") {
      const res = await fetchWithTimeout("https://api.xero.com/connections", {
        headers,
      });
      return {
        provider,
        ok: res.ok,
        httpStatus: res.status,
        error: res.ok ? undefined : `Xero connections ${res.status}`,
      };
    }

    if (provider === "QUICKBOOKS") {
      const row = await prisma.integration.findUnique({
        where: { id: integrationId },
        select: { realmId: true },
      });
      const realmId = row?.realmId?.trim();
      if (!realmId) {
        return { provider, ok: false, error: "missing realmId" };
      }
      const url = `https://quickbooks.api.intuit.com/v3/company/${encodeURIComponent(realmId)}/companyinfo/${encodeURIComponent(realmId)}?minorversion=70`;
      const res = await fetchWithTimeout(url, { headers });
      return {
        provider,
        ok: res.ok,
        httpStatus: res.status,
        error: res.ok ? undefined : `QuickBooks companyinfo ${res.status}`,
      };
    }

    if (provider === "SERVICEM8") {
      const res = await fetchWithTimeout(
        "https://api.servicem8.com/api_1.0/company.json",
        { headers },
      );
      return {
        provider,
        ok: res.ok,
        httpStatus: res.status,
        error: res.ok ? undefined : `ServiceM8 company ${res.status}`,
      };
    }

    if (provider === "MYOB") {
      const res = await fetchWithTimeout(
        "https://api.myob.com/accountright/",
        { headers },
      );
      return {
        provider,
        ok: res.status < 500,
        httpStatus: res.status,
        error:
          res.status < 500 ? undefined : `MYOB probe ${res.status}`,
      };
    }

    if (provider === "ZOHO") {
      const res = await fetchWithTimeout(
        "https://www.zohoapis.com.au/crm/v6/settings/modules",
        { headers },
      );
      return {
        provider,
        ok: res.ok,
        httpStatus: res.status,
        error: res.ok ? undefined : `Zoho modules ${res.status}`,
      };
    }

    return { provider, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { provider, ok: false, error: message.slice(0, 200) };
  }
}

export function isOAuthLiveProbeEnabled(): boolean {
  const raw = process.env.INTEGRATIONS_OAUTH_PROBE?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}

export async function probeOAuthIntegrations(
  integrationRows: { id: string; provider: string }[],
): Promise<OAuthProbeResult[]> {
  const oauthRows = integrationRows.filter((row) =>
    isOAuthProvider(row.provider),
  );
  if (oauthRows.length === 0) return [];

  const capped = oauthRows.slice(0, 8);
  return Promise.all(
    capped.map((row) => probeOne(row.id, row.provider as OAuthProvider)),
  );
}