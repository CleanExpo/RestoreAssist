import type { Prisma } from "@prisma/client";
import { classifyIntegrationIdentity, getOAuthReadiness } from "@/lib/integrations/identity";

export const INTEGRATION_METADATA_SELECT = {
  id: true, userId: true, workspaceId: true, provider: true, name: true,
  description: true, icon: true, status: true, tokenExpiresAt: true,
  tenantId: true, realmId: true, companyId: true, lastSyncAt: true,
  syncError: true, createdAt: true, updatedAt: true,
} as const;
type Metadata = Prisma.IntegrationGetPayload<{ select: typeof INTEGRATION_METADATA_SELECT }> & { config?: unknown };

/** Explicit response allowlist: neither legacy config nor credentials cross it. */
export function integrationPublicMetadata(row: Metadata, hasOAuthCredentials = false) {
  const identity = classifyIntegrationIdentity(row);
  return {
    id: row.id, userId: row.userId, workspaceId: row.workspaceId,
    name: row.name, description: row.description, icon: row.icon,
    status: row.status, tokenExpiresAt: row.tokenExpiresAt,
    tenantId: row.tenantId, realmId: row.realmId, companyId: row.companyId,
    lastSyncAt: row.lastSyncAt, syncError: row.syncError,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    kind: identity.kind, provider: identity.provider, source: "legacy" as const,
    hasOAuthCredentials: identity.kind === "OAUTH" && hasOAuthCredentials,
    readiness: identity.kind === "OAUTH" ? getOAuthReadiness({ ...row, hasOAuthCredentials }) : null,
  };
}
