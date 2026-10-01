/**
 * NIR Sync Orchestrator
 *
 * Single entry point for syncing a completed NIR to all connected integrations.
 * Dispatches in parallel. Per-provider errors are captured — one failing
 * provider never aborts the others.
 *
 * Usage:
 *   const results = await syncNIRToAllConnectedIntegrations(userId, payload)
 *   const result  = await syncNIRToSpecificIntegration(userId, integrationId, payload)
 */

import { prisma } from "@/lib/prisma";
import { syncNIRJobToXero } from "./xero/nir-sync";
import { syncNIRJobToQuickBooks } from "./quickbooks/nir-sync";
import { syncNIRJobToMYOB } from "./myob/nir-sync";
import { syncNIRJobToServiceM8 } from "./servicem8/nir-sync";
import { runInclusionCheck } from "@/lib/iicrc-inclusion-check";
import { isOAuthIntegration } from "./identity";

export type { NIRJobPayload } from "./xero/nir-sync";

export interface NIRSyncResult {
  integrationId: string;
  provider: string;
  status: "success" | "error" | "skipped";
  externalId?: string;
  externalReference?: string;
  error?: string;
}

export async function syncNIRToAllConnectedIntegrations(
  userId: string,
  payload: import("./xero/nir-sync").NIRJobPayload,
): Promise<NIRSyncResult[]> {
  const report = await prisma.report.findFirst({
    where: { id: payload.reportId, userId },
    select: { id: true, userId: true, workspaceId: true },
  });
  if (!report) return [];
  const integrations = await prisma.integration.findMany({
    where: { userId, workspaceId: report.workspaceId ?? null, status: "CONNECTED" },
    select: { id: true, provider: true, name: true, icon: true, config: true, tenantId: true, realmId: true, companyId: true, tokenExpiresAt: true },
    take: 250,
  });
  if (integrations.length === 0) return [];

  // RA-5040 PR1: non-gating pre-sync read. Reviewer-prompt gaps are logged
  // for visibility only — they never block or delay the sync below.
  const inclusionCheck = runInclusionCheck(
    payload.damageType,
    payload as unknown as Record<string, unknown>,
  );
  if (inclusionCheck.missing.length > 0) {
    console.log(
      `[NIR Sync] IICRC inclusion check (${inclusionCheck.claimType}): ${inclusionCheck.missing.length} reviewer prompt(s) not yet addressed —`,
      inclusionCheck.missing.map((p) => p.id).join(", "),
    );
  }

  return Promise.all(
    integrations.filter(i => isOAuthIntegration(i)).map((i) =>
      syncNIRToSpecificIntegration(userId, i.id, payload, i.provider),
    ),
  );
}

export async function syncNIRToSpecificIntegration(
  userId: string,
  integrationId: string,
  payload: import("./xero/nir-sync").NIRJobPayload,
  providerHint?: string,
): Promise<NIRSyncResult> {
  const report = await prisma.report.findFirst({
    where: { id: payload.reportId, userId },
    select: { id: true, userId: true, workspaceId: true },
  });
  if (!report) {
    return { integrationId, provider: providerHint || "UNKNOWN", status: "error", error: "Source report not found" };
  }
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, userId, workspaceId: report.workspaceId ?? null },
    select: { id: true, provider: true, status: true, name: true, icon: true, config: true, tenantId: true, realmId: true, companyId: true, tokenExpiresAt: true },
  });
  if (!integration)
    return {
      integrationId,
      provider: providerHint || "UNKNOWN",
      status: "error",
      error: "Integration not found",
    };
  if (!isOAuthIntegration(integration, providerHint)) {
    return { integrationId, provider: providerHint || integration.provider,
      status: "skipped", error: "Invalid OAuth integration identity or provider" };
  }
  if (integration.status !== "CONNECTED")
    return {
      integrationId,
      provider: integration.provider,
      status: "skipped",
      error: `Status: ${integration.status}`,
    };

  try {
    switch (integration.provider) {
      case "XERO": {
        const r = await syncNIRJobToXero(integrationId, payload);
        return {
          integrationId,
          provider: "XERO",
          status: "success",
          externalId: r.xeroInvoiceId,
          externalReference: r.xeroInvoiceNumber,
        };
      }
      case "QUICKBOOKS": {
        const r = await syncNIRJobToQuickBooks(integrationId, payload);
        return {
          integrationId,
          provider: "QUICKBOOKS",
          status: "success",
          externalId: r.qboInvoiceId,
          externalReference: r.qboDocNumber,
        };
      }
      case "MYOB": {
        const r = await syncNIRJobToMYOB(integrationId, payload);
        return {
          integrationId,
          provider: "MYOB",
          status: "success",
          externalId: r.myobSaleId,
        };
      }
      case "SERVICEM8": {
        const r = await syncNIRJobToServiceM8(integrationId, payload);
        return {
          integrationId,
          provider: "SERVICEM8",
          status: "success",
          externalId: r.sm8JobUuid,
          externalReference: r.sm8JobNumber,
        };
      }
      default:
        return {
          integrationId,
          provider: integration.provider,
          status: "skipped",
          error: "Unknown provider",
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[NIR Sync] ${integration.provider} failed:`, message);
    return {
      integrationId,
      provider: integration.provider,
      status: "error",
      error: message,
    };
  }
}
