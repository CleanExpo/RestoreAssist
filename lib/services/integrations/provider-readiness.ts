import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/integrations/identity";
import { describeOAuthCard, type LegacyIntegrationMetadata } from "./display";

/**
 * One provider's connection state for monitoring screens (RA-8445).
 *
 * - `connected` is the readiness owner's answer (describeOAuthCard, which asks
 *   getOAuthReadiness). A CONNECTED row with no organisation is `false`.
 * - `connected: null` means the owner does not cover this provider (Ascora,
 *   Zoho), so this screen makes no claim either way.
 * - `status` is the owner's card state for OAuth providers, otherwise the
 *   stored value unchanged.
 */
export interface ProviderReadiness {
  status: string;
  connected: boolean | null;
  attention: string | null;
}

/**
 * Describe every provider that has at least one row. Rows must carry
 * `hasOAuthCredentials`; without it the owner treats every row as
 * CREDENTIALS_REQUIRED. Pass `truncated` when the row list was capped.
 */
export function describeProviderReadiness(
  rows: LegacyIntegrationMetadata[],
  truncated: boolean,
): Record<string, ProviderReadiness> {
  const result: Record<string, ProviderReadiness> = {};
  for (const row of rows) {
    const provider = row.provider;
    if (!provider || provider in result) continue;
    if (!OAUTH_PROVIDERS.includes(provider as OAuthProvider)) {
      result[provider] = { status: row.status ?? "DISCONNECTED", connected: null, attention: null };
      continue;
    }
    const card = describeOAuthCard(rows, provider, truncated);
    result[provider] = {
      status: card.status,
      connected: card.connected,
      attention: card.connected ? null : card.syncError ?? null,
    };
  }
  return result;
}
