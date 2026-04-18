/**
 * google-token-refresh.ts — RA-1271 — Proactive Google OAuth token refresh.
 *
 * Google refresh tokens can be invalidated after 6 months of inactivity
 * (https://developers.google.com/identity/protocols/oauth2#expiration).
 * If a user opens no Claims/Drive views for months, the refresh token
 * silently dies and every subsequent access is a 401 the UI can't recover
 * from without a full re-consent flow.
 *
 * This cron exercises each Google `Account` record weekly by calling the
 * OAuth token endpoint with the stored refresh_token. Google updates the
 * "last used" timestamp on the refresh token even if the access token
 * doesn't end up being used downstream, which prevents the 6-month
 * inactivity invalidation.
 *
 * Scope: only rows in `account` with provider='google' AND non-null
 * refresh_token. Skips providers other than google to keep blast radius
 * contained.
 */
import { prisma } from "@/lib/prisma";
import type { CronJobResult } from "./runner";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const REFRESH_TIMEOUT_MS = 10_000;

export async function refreshGoogleTokens(): Promise<CronJobResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      itemsProcessed: 0,
      metadata: { reason: "missing-google-client-env" },
    };
  }

  const accounts = await prisma.account.findMany({
    where: {
      provider: "google",
      refresh_token: { not: null },
    },
    select: {
      id: true,
      userId: true,
      refresh_token: true,
      expires_at: true,
      scope: true,
    },
  });

  if (accounts.length === 0) {
    return { itemsProcessed: 0, metadata: { reason: "no-google-accounts" } };
  }

  let refreshed = 0;
  let failed = 0;
  let invalidated = 0;
  const failures: Array<{ accountId: string; userId: string; reason: string }> =
    [];

  for (const acc of accounts) {
    if (!acc.refresh_token) continue; // narrowing; filter already applied

    const outcome = await refreshOne(
      clientId,
      clientSecret,
      acc.refresh_token,
    );

    if (outcome.ok) {
      refreshed++;
      await prisma.account.update({
        where: { id: acc.id },
        data: {
          access_token: outcome.accessToken,
          expires_at: outcome.expiresAt,
        },
      });
      continue;
    }

    failed++;
    failures.push({
      accountId: acc.id,
      userId: acc.userId,
      reason: outcome.reason,
    });

    // invalid_grant = refresh token revoked or inactivity-expired.
    // Clear the dead refresh_token so the UI can prompt re-consent and we
    // don't keep hammering Google with a bad token.
    if (outcome.isInvalidGrant) {
      invalidated++;
      await prisma.account.update({
        where: { id: acc.id },
        data: { refresh_token: null, access_token: null, expires_at: null },
      });
    }
  }

  return {
    itemsProcessed: accounts.length,
    metadata: {
      refreshed,
      failed,
      invalidated,
      failures: failures.slice(0, 20), // cap payload
    },
  };
}

type RefreshOutcome =
  | { ok: true; accessToken: string | null; expiresAt: number | null }
  | { ok: false; reason: string; isInvalidGrant: boolean };

async function refreshOne(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<RefreshOutcome> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      // Google returns {"error":"invalid_grant"} when the refresh token is
      // revoked, expired by 6-month inactivity, or was issued for a since-
      // deleted user. All three cases mean "clear and re-consent".
      const isInvalidGrant =
        res.status === 400 && text.includes("invalid_grant");
      return {
        ok: false,
        reason: `${res.status}: ${text.slice(0, 160)}`,
        isInvalidGrant,
      };
    }

    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    const expiresAt = data.expires_in
      ? Math.floor(Date.now() / 1000) + data.expires_in
      : null;
    return {
      ok: true,
      accessToken: data.access_token ?? null,
      expiresAt,
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : "unknown";
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: `fetch-${name}: ${msg.slice(0, 120)}`,
      isInvalidGrant: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
