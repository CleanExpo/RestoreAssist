/**
 * Structured-result Xero tenant lookup.
 *
 * Returns ServiceResult<tenantId, reason> so callers map reasons to HTTP
 * status codes / audit events without try/catch ladders.
 *
 * Reasons:
 *  - TENANT_MISSING — integration row found but tenantId is null;
 *                     user must re-connect their Xero org.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { prisma } from "@/lib/prisma";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";
import { isOAuthIntegration } from "@/lib/integrations/identity";

export type XeroTenantReason = "TENANT_MISSING" | "INVALID_INTEGRATION";

export async function getXeroTenantId(
  integrationId: string,
): Promise<ServiceResult<string, XeroTenantReason>> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { tenantId: true, provider: true, name: true, icon: true, config: true, tokenExpiresAt: true },
  });

  if (!integration || !isOAuthIntegration(integration, "XERO")) {
    return fail("INVALID_INTEGRATION", { detail: "Invalid Xero integration identity" });
  }

  if (!integration?.tenantId) {
    return fail("TENANT_MISSING", {
      detail: `Integration ${integrationId} has no Xero tenantId — user must re-connect`,
    });
  }

  return ok(integration.tenantId);
}
