/**
 * Structured-result QuickBooks credentials service.
 *
 * Mirrors lib/services/xero/credentials.ts (RA-6920 B5): returns
 * ServiceResult<accessToken, reason> so the outbound invoice-push path can
 * proactively refresh an expired token on a 401/403 and let the durable queue
 * retry with the fresh token, instead of dead-lettering a recoverable job.
 *
 * Reasons:
 *  - DISCONNECTED       — no access token; user must reconnect
 *  - RECONNECT_REQUIRED — token expired and no refresh token; user must reconnect
 *  - REFRESH_FAILED     — refresh attempt failed (invalid_grant, network, etc.)
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import {
  getTokens,
  markIntegrationError,
} from "@/lib/integrations/oauth-handler";
import { QuickBooksClient } from "@/lib/integrations/quickbooks/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";
import { isOAuthIntegration } from "@/lib/integrations/identity";

export type QuickBooksCredentialsReason =
  | "INVALID_INTEGRATION"
  | "DISCONNECTED"
  | "RECONNECT_REQUIRED"
  | "REFRESH_FAILED";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export async function getValidQuickBooksAccessToken(
  integrationId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<ServiceResult<string, QuickBooksCredentialsReason>> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { provider: true, name: true, icon: true, config: true, realmId: true, tokenExpiresAt: true },
  });
  if (!integration || !isOAuthIntegration(integration, "QUICKBOOKS")) {
    return fail("INVALID_INTEGRATION", { detail: "Invalid QuickBooks integration identity" });
  }
  const tokens = await getTokens(integrationId, "QUICKBOOKS");

  if (!tokens.accessToken) {
    return fail("DISCONNECTED", {
      detail: `Integration ${integrationId} has no access token`,
    });
  }

  const needsRefresh =
    options.forceRefresh ||
    tokens.isExpired ||
    (tokens.tokenExpiresAt != null &&
      tokens.tokenExpiresAt.getTime() - Date.now() < FIVE_MINUTES_MS);

  if (!needsRefresh) {
    return ok(tokens.accessToken);
  }

  if (!tokens.refreshToken) {
    await markIntegrationError(
      integrationId,
      "QuickBooks token expired and no refresh token — user must re-connect",
      "QUICKBOOKS",
    );
    return fail("RECONNECT_REQUIRED", {
      detail: "Token expired and no refresh token available",
    });
  }

  try {
    const client = new QuickBooksClient(
      integrationId,
      integration?.realmId ?? undefined,
    );
    await client.refreshAccessToken();
    const fresh = await getTokens(integrationId, "QUICKBOOKS");
    if (!fresh.accessToken) {
      return fail("REFRESH_FAILED", {
        detail: "Refresh completed but token still missing",
      });
    }
    return ok(fresh.accessToken);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return fail("REFRESH_FAILED", { detail, cause: err });
  }
}
