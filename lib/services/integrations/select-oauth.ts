import type { Prisma, PrismaClient } from "@prisma/client";
import { getOAuthReadiness, isOAuthIntegration, LEGACY_AI_NAMES, OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/integrations/identity";
import { isZohoEnabled } from "@/lib/flags/one-crm-flags";

/**
 * Providers a broad (not single-provider) query may name in SQL. RA-8215: ZOHO
 * joined the IntegrationProvider enum in migration
 * 20261105050000_ra8199_zoho_crm, and a database without that migration
 * rejects any query naming it (P2007), which broke every XERO / QuickBooks /
 * MYOB lookup sharing this filter. Broad queries leave ZOHO out until the Zoho
 * switch is on; apply the migration before turning the switch on.
 */
export function queryableOAuthProviders(zohoEnabled: boolean = isZohoEnabled()): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter(provider => provider !== "ZOHO" || zohoEnabled);
}

/** Positive identity and known-AI exclusions for the given providers only. */
export function oauthCandidateWhere(providers: readonly OAuthProvider[]): Prisma.IntegrationWhereInput {
  return {
    AND: [
      { provider: { in: [...providers] } },
      { OR: [{ icon: null }, { icon: { not: "[ra:ai]" } }] },
      { name: { notIn: LEGACY_AI_NAMES, mode: "insensitive" } },
      { OR: [
        { name: { in: ["Xero", "QuickBooks", "QuickBooks Online", "MYOB", "ServiceM8", "Service M8", "Zoho", "Zoho CRM"], mode: "insensitive" } },
        { icon: { in: OAUTH_PROVIDERS.map(provider => `/integrations/${provider.toLowerCase()}.svg`) } },
        { tokenExpiresAt: { not: null } }, { tenantId: { not: null, notIn: [""] } },
        { realmId: { not: null, notIn: [""] } }, { companyId: { not: null, notIn: [""] } },
      ] },
    ],
  };
}

/** Apply positive identity and known-AI exclusions before a bounded query. */
export const OAUTH_CANDIDATE_WHERE: Prisma.IntegrationWhereInput = oauthCandidateWhere(queryableOAuthProviders());

export const OAUTH_IDENTITY_SELECT = {
  id: true, userId: true, workspaceId: true, provider: true, name: true,
  icon: true, config: true, status: true, tenantId: true, realmId: true,
  companyId: true, tokenExpiresAt: true,
} as const;
export type SelectedOAuthIntegration = Prisma.IntegrationGetPayload<{ select: typeof OAUTH_IDENTITY_SELECT }>;
export type OAuthSelectionResult =
  | { ok: true; data: SelectedOAuthIntegration }
  | { ok: false; reason: "INVALID_PROVIDER" | "NOT_FOUND" | "AMBIGUOUS" | "NOT_READY"; detail?: string };

/** Resolve exactly one owned identity; ambiguity must never select another workspace. */
export async function selectOAuthIntegration(input: {
  prisma: Pick<PrismaClient, "integration">;
  userId: string;
  provider: string;
  integrationId?: string;
  workspaceId?: string | null;
  requireReady?: boolean;
}): Promise<OAuthSelectionResult> {
  if (!OAUTH_PROVIDERS.includes(input.provider as OAuthProvider)) {
    return { ok: false, reason: "INVALID_PROVIDER" };
  }
  const provider = input.provider as OAuthProvider;
  // Name only the requested provider: a XERO lookup never sends ZOHO to SQL,
  // and an existing ZOHO connection stays reachable (reconnect, disconnect)
  // while the Zoho switch is off.
  const where: Prisma.IntegrationWhereInput = {
    ...oauthCandidateWhere([provider]),
    userId: input.userId,
    provider,
    ...(input.integrationId ? { id: input.integrationId } : {}),
    ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
  };
  const rows = await input.prisma.integration.findMany({
    where, select: OAUTH_IDENTITY_SELECT, orderBy: { id: "asc" }, take: 101,
  });
  if (rows.length > 100) return { ok: false, reason: "AMBIGUOUS" };
  const candidates = rows.filter(row => isOAuthIntegration(row, input.provider));
  if (candidates.length > 1) return { ok: false, reason: "AMBIGUOUS" };
  const integration = candidates[0];
  if (!integration) return { ok: false, reason: "NOT_FOUND" };
  if (input.requireReady) {
    // Test presence in SQL without reading token material into this service.
    const credential = await input.prisma.integration.findFirst({
      where: { ...where, id: integration.id, accessToken: { not: null, notIn: [""] } }, select: { id: true },
    });
    const readiness = getOAuthReadiness({ ...integration, hasOAuthCredentials: Boolean(credential) }, input.provider);
    if (!readiness.ready) return { ok: false, reason: "NOT_READY", detail: readiness.reason };
  }
  return { ok: true, data: integration };
}
