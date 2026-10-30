import { apiErrorMessage } from "@/lib/api-error-message";
import { isIntegrationCount } from "@/lib/services/integrations/display";

/** OAuth / API-key CRM providers that share the external sync routes. */
export type ExternalProviderSlug =
  | "xero"
  | "quickbooks"
  | "myob"
  | "servicem8"
  | "ascora";

const SLUGS = new Set<string>([
  "xero",
  "quickbooks",
  "myob",
  "servicem8",
  "ascora",
]);

/** Map Integration.provider (any casing) to the slug used in API routes. */
export function integrationProviderToSlug(
  provider: string,
): ExternalProviderSlug | null {
  const key = provider.trim().toLowerCase();
  if (key === "quickbooks" || key === "qbo") return "quickbooks";
  if (key === "servicem8" || key === "service_m8") return "servicem8";
  if (SLUGS.has(key)) return key as ExternalProviderSlug;
  return null;
}

export function externalSyncEndpoint(slug: ExternalProviderSlug): string {
  return slug === "ascora"
    ? "/api/ascora/sync"
    : `/api/integrations/oauth/${slug}/sync`;
}

export const EXTERNAL_SYNC_REQUEST_BODY = {
  syncClients: true,
  syncJobs: true,
} as const;

export function formatExternalSyncSuccessMessage(
  slug: ExternalProviderSlug,
  data: Record<string, unknown>,
): string | null {
  if (slug === "ascora") {
    if (typeof data.message === "string" && data.message.trim()) {
      return data.message.trim();
    }
    const jobs = data.jobsImported ?? 0;
    const lines = data.lineItemsForImport ?? 0;
    const parts = data.rateCardPartsUpserted ?? 0;
    return `Imported ${jobs} jobs, ${lines} line items and ${parts} rate card parts`;
  }
  if (
    !isIntegrationCount(data.clientsSynced) ||
    !isIntegrationCount(data.jobsSynced)
  ) {
    return null;
  }
  return `Synced ${data.clientsSynced} clients and ${data.jobsSynced} jobs`;
}

export async function requestExternalIntegrationSync(
  slug: ExternalProviderSlug,
): Promise<Response> {
  return fetch(externalSyncEndpoint(slug), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(EXTERNAL_SYNC_REQUEST_BODY),
  });
}

export type ExternalSyncResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/** Same sync contract as Integrations → Sync (handleSyncExternal). */
export async function runExternalIntegrationSync(
  slug: ExternalProviderSlug,
): Promise<ExternalSyncResult> {
  const response = await requestExternalIntegrationSync(slug);
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (response.ok) {
    const message = formatExternalSyncSuccessMessage(slug, data);
    if (!message) {
      return {
        ok: false,
        message:
          "Sync returned an incomplete result. Refresh its status before retrying.",
      };
    }
    return { ok: true, message };
  }

  if (response.status === 403 && data.upgradeRequired) {
    return {
      ok: false,
      message: "Subscription upgrade required to sync this integration.",
    };
  }

  return {
    ok: false,
    message: apiErrorMessage(data) ?? `HTTP ${response.status}`,
  };
}
