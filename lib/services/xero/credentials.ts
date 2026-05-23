/**
 * Structured-result Xero credentials service.
 *
 * Returns ServiceResult<accessToken, reason> so callers map reasons to HTTP
 * status codes / audit events without try/catch ladders.
 *
 * Reasons:
 *  - DISCONNECTED       — no access token; user must reconnect
 *  - RECONNECT_REQUIRED — token expired and no refresh token; user must reconnect
 *  - REFRESH_FAILED     — refresh attempt failed (invalid_grant, network, etc.)
 *
 * Replaces the throw-based getValidXeroToken from
 * lib/integrations/xero/token-manager.ts. That export is preserved as a
 * deprecation shim during migration.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import {
  getTokens,
  markIntegrationError,
} from "@/lib/integrations/oauth-handler";
import { XeroClient } from "@/lib/integrations/xero/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";

export type XeroCredentialsReason =
  | "DISCONNECTED"
  | "RECONNECT_REQUIRED"
  | "REFRESH_FAILED";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export async function getValidXeroAccessToken(
  integrationId: string,
): Promise<ServiceResult<string, XeroCredentialsReason>> {
  const tokens = await getTokens(integrationId);

  if (!tokens.accessToken) {
    return fail("DISCONNECTED", {
      detail: `Integration ${integrationId} has no access token`,
    });
  }

  const needsRefresh =
    tokens.isExpired ||
    (tokens.tokenExpiresAt != null &&
      tokens.tokenExpiresAt.getTime() - Date.now() < FIVE_MINUTES_MS);

  if (!needsRefresh) {
    return ok(tokens.accessToken);
  }

  if (!tokens.refreshToken) {
    await markIntegrationError(
      integrationId,
      "Xero token expired and no refresh token — user must re-connect",
    );
    return fail("RECONNECT_REQUIRED", {
      detail: "Token expired and no refresh token available",
    });
  }

  try {
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
      select: { tenantId: true },
    });
    const client = new XeroClient(
      integrationId,
      integration?.tenantId ?? undefined,
    );
    await client.refreshAccessToken();
    const fresh = await getTokens(integrationId);
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
