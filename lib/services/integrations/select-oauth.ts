import type { Prisma, PrismaClient } from "@prisma/client";
import { getOAuthReadiness, isOAuthIntegration, LEGACY_AI_NAMES, OAUTH_PROVIDERS } from "@/lib/integrations/identity";

/** Apply positive identity and known-AI exclusions before a bounded query. */
export const OAUTH_CANDIDATE_WHERE: Prisma.IntegrationWhereInput = {
  AND: [
    { provider: { in: [...OAUTH_PROVIDERS] } },
    { OR: [{ icon: null }, { icon: { not: "[ra:ai]" } }] },
    { name: { notIn: LEGACY_AI_NAMES, mode: "insensitive" } },
    { OR: [
      { name: { in: ["Xero", "QuickBooks", "QuickBooks Online", "MYOB", "ServiceM8", "Service M8"], mode: "insensitive" } },
      { icon: { in: OAUTH_PROVIDERS.map(provider => `/integrations/${provider.toLowerCase()}.svg`) } },
      { tokenExpiresAt: { not: null } }, { tenantId: { not: null, notIn: [""] } },
      { realmId: { not: null, notIn: [""] } }, { companyId: { not: null, notIn: [""] } },
    ] },
  ],
};

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
  if (!OAUTH_PROVIDERS.includes(input.provider as typeof OAUTH_PROVIDERS[number])) {
    return { ok: false, reason: "INVALID_PROVIDER" };
  }
  const where: Prisma.IntegrationWhereInput = {
    ...OAUTH_CANDIDATE_WHERE,
    userId: input.userId,
    provider: input.provider as typeof OAUTH_PROVIDERS[number],
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
