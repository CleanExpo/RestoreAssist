/**
 * Structured-result MYOB credentials service.
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
import { MYOBClient } from "@/lib/integrations/myob/client";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";

export type MYOBCredentialsReason =
  | "DISCONNECTED"
  | "RECONNECT_REQUIRED"
  | "REFRESH_FAILED";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export async function getValidMYOBAccessToken(
  integrationId: string,
): Promise<ServiceResult<string, MYOBCredentialsReason>> {
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
      "MYOB token expired and no refresh token — user must re-connect",
    );
    return fail("RECONNECT_REQUIRED", {
      detail: "Token expired and no refresh token available",
    });
  }

  try {
    const client = new MYOBClient(integrationId);
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
