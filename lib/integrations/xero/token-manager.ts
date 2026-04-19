/**
 * RA-868: Centralised Xero Token Manager
 *
 * Single source of truth for Xero access token lifecycle.
 * All Xero-touching modules must import getValidXeroToken from here —
 * no other token refresh logic should exist anywhere in the codebase.
 *
 * Responsibilities:
 *  1. Load tokens from DB via getTokens()
 *  2. Proactively refresh if token expires within 5 minutes
 *  3. Store refreshed tokens via storeTokens()
 *  4. On refresh failure: call markIntegrationError() + throw XeroTokenError
 *  5. Return a valid accessToken string
 */

import {
  getTokens,
  storeTokens,
  markIntegrationError,
  disconnectIntegration,
} from "../oauth-handler";
import { XeroClient } from "./client";
import { prisma } from "@/lib/prisma";

// ─── Error class ──────────────────────────────────────────────────────────────

export class XeroTokenError extends Error {
  public readonly integrationId: string;

  constructor(integrationId: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Xero token error for integration ${integrationId}: ${reason}`);
    this.name = "XeroTokenError";
    this.integrationId = integrationId;
    // Preserve cause for Node 16.9+ environments
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Return a valid Xero access token for the given integration ID.
 *
 * - Fetches current tokens from DB
 * - Proactively refreshes if token expires within 5 minutes
 * - Throws XeroTokenError if the integration is disconnected or refresh fails
 */
export async function getValidXeroToken(
  integrationId: string,
): Promise<string> {
  const tokens = await getTokens(integrationId);

  if (!tokens.accessToken) {
    throw new XeroTokenError(
      integrationId,
      "No access token — integration disconnected",
    );
  }

  // Proactive refresh: if token expires in less than 5 minutes, refresh now
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  const needsRefresh =
    tokens.isExpired ||
    (tokens.tokenExpiresAt != null &&
      tokens.tokenExpiresAt.getTime() - Date.now() < FIVE_MINUTES_MS);

  if (needsRefresh) {
    if (!tokens.refreshToken) {
      await markIntegrationError(
        integrationId,
        "Xero token expired and no refresh token available — user must re-connect",
      );
      throw new XeroTokenError(
        integrationId,
        "Token expired — no refresh token. User must re-connect Xero.",
      );
    }

    try {
      // Fetch tenantId needed by XeroClient constructor
      const integration = await prisma.integration.findUnique({
        where: { id: integrationId },
        select: { tenantId: true },
      });

      const client = new XeroClient(
        integrationId,
        integration?.tenantId ?? undefined,
      );
      await client.refreshAccessToken();

      // Re-fetch the freshly stored token
      const fresh = await getTokens(integrationId);
      if (!fresh.accessToken) {
        throw new Error(
          "refreshAccessToken() completed but token still missing",
        );
      }

      return fresh.accessToken;
    } catch (err) {
      // RA-1308 — distinguish terminal auth failures (user revoked app,
      // refresh token expired) from transient errors (network, 5xx). On
      // terminal failure move to DISCONNECTED so the dashboard can prompt
      // reconnect; otherwise stay in ERROR so retry can recover.
      const msg = err instanceof Error ? err.message : String(err);
      const isTerminal = isTerminalAuthFailure(msg);
      if (isTerminal) {
        await disconnectIntegration(integrationId);
      } else {
        await markIntegrationError(
          integrationId,
          `Token refresh failed: ${msg}`,
        );
      }
      throw new XeroTokenError(integrationId, err);
    }
  }

  return tokens.accessToken;
}

// ─── Terminal-auth heuristic (RA-1308) ────────────────────────────────────────

/**
 * Best-effort classification of a refresh-token error message as a
 * terminal auth failure (user must reconnect). Matches Xero, QBO, MYOB
 * error shapes. Conservative: anything unrecognised falls through to
 * non-terminal (ERROR state), so the sync can retry on transient issues.
 */
function isTerminalAuthFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("invalid_grant") ||
    m.includes("invalid_client") ||
    m.includes("unauthorized_client") ||
    m.includes(" 401") ||
    m.includes("http 401") ||
    m.includes(" 403") ||
    m.includes("http 403") ||
    m.includes("revoked") ||
    m.includes("token has been revoked") ||
    m.includes("user must re-connect")
  );
}

// ─── Tenant helper ────────────────────────────────────────────────────────────

/**
 * Return the Xero tenantId for an integration, throwing if missing.
 * Used alongside getValidXeroToken in any function that calls the Xero API.
 */
export async function getXeroTenantId(integrationId: string): Promise<string> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { tenantId: true },
  });

  if (!integration?.tenantId) {
    throw new XeroTokenError(
      integrationId,
      "Xero tenant ID missing — user must re-connect",
    );
  }

  return integration.tenantId;
}
