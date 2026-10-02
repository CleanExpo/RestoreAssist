/** A Xero grant and its organisation are one compare-and-swap binding. */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/credential-vault";
import { isOAuthIntegration } from "@/lib/integrations/identity";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";

export const XERO_BINDING_SELECT = {
  id: true, userId: true, workspaceId: true, provider: true,
  name: true, icon: true, config: true, status: true, updatedAt: true,
  tenantId: true, realmId: true, companyId: true,
  accessToken: true, refreshToken: true, tokenExpiresAt: true,
} as const;
export type XeroBinding = Prisma.IntegrationGetPayload<{ select: typeof XERO_BINDING_SELECT }>;
export type XeroBindingReason = "INVALID_INTEGRATION" | "DISCONNECTED" | "BINDING_CHANGED";
export interface XeroBindingExpectation {
  expectedTenantId?: string;
  expectedUserId?: string;
  expectedWorkspaceId?: string | null;
}

export function xeroBindingWhere(binding: XeroBinding) {
  // Token ciphertext is included as well as the version, so even same-clock-tick
  // commits cannot attach one grant's organisation to another grant's token.
  return {
    id: binding.id, userId: binding.userId, workspaceId: binding.workspaceId,
    provider: binding.provider, name: binding.name, icon: binding.icon, config: binding.config,
    updatedAt: binding.updatedAt, status: binding.status, tenantId: binding.tenantId,
    accessToken: binding.accessToken, refreshToken: binding.refreshToken,
    tokenExpiresAt: binding.tokenExpiresAt,
  };
}

export async function readXeroBinding(
  integrationId: string,
  expected: XeroBindingExpectation = {},
): Promise<ServiceResult<XeroBinding, XeroBindingReason>> {
  const binding = await prisma.integration.findUnique({ where: { id: integrationId }, select: XERO_BINDING_SELECT });
  if (!binding || !isOAuthIntegration(binding, "XERO")) {
    return fail("INVALID_INTEGRATION", { detail: "Invalid Xero integration identity" });
  }
  if (expected.expectedTenantId !== undefined && binding.tenantId !== expected.expectedTenantId ||
      expected.expectedUserId !== undefined && binding.userId !== expected.expectedUserId ||
      Object.hasOwn(expected, "expectedWorkspaceId") && binding.workspaceId !== expected.expectedWorkspaceId) {
    return fail("BINDING_CHANGED", { detail: "Xero connection binding changed; retry with the current connection" });
  }
  return ok(binding);
}

export async function readReadyXeroBinding(integrationId: string, expected: XeroBindingExpectation = {}) {
  const result = await readXeroBinding(integrationId, expected);
  if (!result.ok) return result;
  const binding = result.data;
  if (!binding.tenantId?.trim() || !binding.accessToken?.trim() || !["CONNECTED", "SYNCING", "ERROR"].includes(binding.status)) {
    return fail("DISCONNECTED" as const, { detail: "Xero connection requires a validated organisation and credentials" });
  }
  try {
    const accessToken = decrypt(binding.accessToken);
    const refreshToken = binding.refreshToken ? decrypt(binding.refreshToken) : null;
    if (!accessToken.trim()) return fail("DISCONNECTED" as const, { detail: "Xero credentials are unavailable; reconnect required" });
    return ok({ binding, tenantId: binding.tenantId, accessToken, refreshToken });
  } catch {
    return fail("DISCONNECTED" as const, { detail: "Xero credentials are unavailable; reconnect required" });
  }
}

export type XeroBindingUpdate = Partial<Pick<XeroBinding,
  "status" | "tenantId" | "realmId" | "companyId" | "accessToken" | "refreshToken" | "tokenExpiresAt"
>> & { syncError?: string | null; lastSyncAt?: Date };

/** Compare grant identity while allowing this operation's own status/log writes. */
export function sameXeroGrant(left: XeroBinding, right: XeroBinding): boolean {
  return (["id", "userId", "workspaceId", "provider", "name", "icon", "config", "tenantId", "accessToken", "refreshToken"] as const)
    .every(key => left[key] === right[key]) &&
    left.tokenExpiresAt?.getTime() === right.tokenExpiresAt?.getTime();
}

export async function updateXeroBinding(
  original: XeroBinding,
  data: XeroBindingUpdate,
  db: Pick<Prisma.TransactionClient, "integration"> = prisma,
): Promise<ServiceResult<XeroBinding, "BINDING_CHANGED">> {
  // Explicit timestamp makes even a metadata-only claim an actual row update.
  const updatedAt = new Date(Math.max(Date.now(), original.updatedAt.getTime() + 1));
  const result = await db.integration.updateMany({ where: xeroBindingWhere(original), data: { ...data, updatedAt } });
  return result.count === 1 ? ok({ ...original, ...data, updatedAt }) : fail("BINDING_CHANGED", { detail: "Xero connection changed during this operation; retry with the current connection" });
}
