/**
 * NIR Sync Orchestrator
 *
 * Single entry point for syncing a completed NIR to all connected integrations.
 * Dispatches in parallel. Per-provider errors are captured — one failing
 * provider never aborts the others.
 *
 * Usage:
 *   const results = await syncNIRToAllConnectedIntegrations(userId, payload)
 *   const result  = await syncNIRToSpecificIntegration(integrationId, payload)
 */

import { prisma } from "@/lib/prisma";
import { syncNIRJobToXero } from "./xero/nir-sync";
import { syncNIRJobToQuickBooks } from "./quickbooks/nir-sync";
import { syncNIRJobToMYOB } from "./myob/nir-sync";
import { syncNIRJobToServiceM8 } from "./servicem8/nir-sync";
import { syncNIRJobToAscora } from "./ascora/nir-sync";

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
  const integrations = await prisma.integration.findMany({
    where: { userId, status: "CONNECTED" },
    select: { id: true, provider: true },
  });
  if (integrations.length === 0) return [];

  return Promise.all(
    integrations.map((i) =>
      syncNIRToSpecificIntegration(i.id, payload, i.provider),
    ),
  );
}

export async function syncNIRToSpecificIntegration(
  integrationId: string,
  payload: import("./xero/nir-sync").NIRJobPayload,
  providerHint?: string,
): Promise<NIRSyncResult> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { id: true, provider: true, status: true },
  });
  if (!integration)
    return {
      integrationId,
      provider: providerHint || "UNKNOWN",
      status: "error",
      error: "Integration not found",
    };
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
      case "ASCORA": {
        const r = await syncNIRJobToAscora(integrationId, payload);
        return {
          integrationId,
          provider: "ASCORA",
          status: "success",
          externalId: r.ascoraJobId,
          externalReference: r.ascoraJobNumber,
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
