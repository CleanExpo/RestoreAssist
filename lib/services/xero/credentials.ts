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

import { XeroClient } from "@/lib/integrations/xero/client";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";
import { readReadyXeroBinding, updateXeroBinding, type XeroBindingExpectation, type XeroBinding } from "./binding";

export type XeroCredentialsReason =
  | "INVALID_INTEGRATION" | "DISCONNECTED" | "BINDING_CHANGED"
  | "RECONNECT_REQUIRED" | "REFRESH_FAILED";

export async function getValidXeroCredentials(
  integrationId: string,
  options: XeroBindingExpectation & { forceRefresh?: boolean } = {},
): Promise<ServiceResult<{ accessToken: string; tenantId: string; binding: XeroBinding }, XeroCredentialsReason>> {
  const current = await readReadyXeroBinding(integrationId, options);
  if (!current.ok) return current;
  const { binding, accessToken, refreshToken, tenantId } = current.data;
  const needsRefresh = options.forceRefresh ||
    (binding.tokenExpiresAt != null && binding.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000);
  if (!needsRefresh) return ok({ accessToken, tenantId, binding });
  if (!refreshToken) {
    const updated = await updateXeroBinding(binding, {
      status: "ERROR", syncError: "Xero token expired and no refresh token — user must re-connect",
    });
    if (!updated.ok) return updated;
    return fail("RECONNECT_REQUIRED", { detail: "Token expired and no refresh token available" });
  }
  try {
    await new XeroClient(integrationId, tenantId).refreshAccessToken({ expectedUserId: binding.userId, expectedWorkspaceId: binding.workspaceId });
    const fresh = await readReadyXeroBinding(integrationId, {
      expectedTenantId: tenantId, expectedUserId: binding.userId,
      expectedWorkspaceId: binding.workspaceId,
    });
    if (!fresh.ok) return fresh;
    return ok({ accessToken: fresh.data.accessToken, tenantId: fresh.data.tenantId, binding: fresh.data.binding });
  } catch (cause) {
    return fail("REFRESH_FAILED", { detail: "Xero credentials could not be refreshed; retry or reconnect", cause });
  }
}

/** Compatibility wrapper for callers that bind their own expected context. */
export async function getValidXeroAccessToken(
  integrationId: string,
  options: XeroBindingExpectation & { forceRefresh?: boolean } = {},
): Promise<ServiceResult<string, XeroCredentialsReason>> {
  const result = await getValidXeroCredentials(integrationId, options);
  return result.ok ? ok(result.data.accessToken) : result;
}
