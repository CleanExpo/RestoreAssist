/**
 * RA-868 + RA-1308: Xero token-manager shim.
 *
 * The throw-based legacy contract is preserved for callers that haven't
 * migrated yet. The actual logic lives in lib/services/xero/credentials.ts.
 *
 * RA-1308 terminal-auth behaviour is preserved at the shim boundary:
 * REFRESH_FAILED is classified into terminal (→ disconnectIntegration) or
 * transient (→ markIntegrationError) before re-throwing XeroTokenError.
 */

import {
  markIntegrationError,
  disconnectIntegration,
} from "../oauth-handler";
import { getValidXeroAccessToken } from "@/lib/services/xero/credentials";
import { prisma } from "@/lib/prisma";

// ─── Error class ──────────────────────────────────────────────────────────────

export class XeroTokenError extends Error {
  public readonly integrationId: string;

  constructor(integrationId: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Xero token error for integration ${integrationId}: ${reason}`);
    this.name = "XeroTokenError";
    this.integrationId = integrationId;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @deprecated Use `getValidXeroAccessToken` from `@/lib/services/xero/credentials`
 *   instead. It returns a ServiceResult<string, XeroCredentialsReason> rather
 *   than throwing. This shim is preserved during migration only; do not add
 *   new callers.
 */
export async function getValidXeroToken(
  integrationId: string,
): Promise<string> {
  const result = await getValidXeroAccessToken(integrationId);
  if (result.ok) return result.data;

  // RA-1308 — preserve legacy side effects on the refresh-failed path.
  // The service already called markIntegrationError for RECONNECT_REQUIRED,
  // and DISCONNECTED is a no-op (no token to manage). Only REFRESH_FAILED
  // needs the terminal-vs-transient classification here.
  if (result.reason === "REFRESH_FAILED") {
    const detail = result.detail ?? "";
    if (isTerminalAuthFailure(detail)) {
      await disconnectIntegration(integrationId);
    } else {
      await markIntegrationError(
        integrationId,
        `Token refresh failed: ${detail}`,
      );
    }
  }

  throw new XeroTokenError(
    integrationId,
    result.cause ?? result.detail ?? `Xero credentials unavailable (${result.reason})`,
  );
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
