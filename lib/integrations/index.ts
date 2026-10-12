/**
 * Integration Clients Index
 * Re-exports all integration clients and utilities
 */

// OAuth Handler
export * from "./oauth-handler";

// Base Client
export * from "./base-client";

// Provider Clients
export { ServiceM8Client, createServiceM8Client } from "./servicem8/client";
export { XeroClient, createXeroClient } from "./xero/client";
export { QuickBooksClient, createQuickBooksClient } from "./quickbooks/client";
export { MYOBClient, createMYOBClient } from "./myob/client";
export { AscoraClient, createAscoraClient } from "./ascora/client";

import { ServiceM8Client } from "./servicem8/client";
import { XeroClient } from "./xero/client";
import { QuickBooksClient } from "./quickbooks/client";
import { MYOBClient } from "./myob/client";
import { prisma } from "@/lib/prisma";
import type { IntegrationProvider } from "./oauth-handler";
import { isOAuthIntegration } from "./identity";

/**
 * Create a client for any provider based on integration ID
 */
export async function createClientForIntegration(integrationId: string) {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { provider: true, name: true, icon: true, config: true, tokenExpiresAt: true, tenantId: true, realmId: true, companyId: true },
  });

  if (!integration || !isOAuthIntegration(integration)) {
    throw new Error("Invalid OAuth integration identity or provider");
  }

  switch (integration.provider) {
    case "SERVICEM8":
      return new ServiceM8Client(integrationId);
    case "XERO":
      return new XeroClient(integrationId, integration.tenantId || undefined);
    case "QUICKBOOKS":
      return new QuickBooksClient(
        integrationId,
        integration.realmId || undefined,
      );
    case "MYOB":
      return new MYOBClient(integrationId);
    default:
      throw new Error(`Unsupported provider: ${integration.provider}`);
  }
}

/**
 * Get auth URL for a provider
 */
export function getProviderAuthUrl(
  provider: IntegrationProvider,
  integrationId: string,
  redirectUri: string,
  state: string,
  codeChallenge?: string,
): string {
  switch (provider) {
    case "SERVICEM8":
      return new ServiceM8Client(integrationId).getAuthUrl(redirectUri, state);
    case "XERO":
      return new XeroClient(integrationId).getAuthUrl(
        redirectUri,
        state,
        codeChallenge,
      );
    case "QUICKBOOKS":
      return new QuickBooksClient(integrationId).getAuthUrl(redirectUri, state);
    case "MYOB":
      return new MYOBClient(integrationId).getAuthUrl(redirectUri, state);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
