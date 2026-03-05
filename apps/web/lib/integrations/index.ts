/**
 * Integration Clients Index
 * Re-exports all integration clients and utilities
 */

// OAuth Handler
export * from './oauth-handler'

// Base Client
export * from './base-client'

// Provider Clients
export { ServiceM8Client, createServiceM8Client } from './servicem8/client'
export { XeroClient, createXeroClient } from './xero/client'
export { QuickBooksClient, createQuickBooksClient } from './quickbooks/client'
export { MYOBClient, createMYOBClient } from './myob/client'
export { AscoraClient, createAscoraClient } from './ascora/client'

import { ServiceM8Client } from './servicem8/client'
import { XeroClient } from './xero/client'
import { QuickBooksClient } from './quickbooks/client'
import { MYOBClient } from './myob/client'
import { AscoraClient } from './ascora/client'
import { prisma } from '@/lib/prisma'
import type { IntegrationProvider } from './oauth-handler'

/**
 * Create a client for any provider based on integration ID
 */
export async function createClientForIntegration(integrationId: string) {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { provider: true, tenantId: true, realmId: true, companyId: true },
  })

  if (!integration) {
    throw new Error('Integration not found')
  }

  switch (integration.provider) {
    case 'SERVICEM8':
      return new ServiceM8Client(integrationId)
    case 'XERO':
      return new XeroClient(integrationId, integration.tenantId || undefined)
    case 'QUICKBOOKS':
      return new QuickBooksClient(integrationId, integration.realmId || undefined)
    case 'MYOB':
      return new MYOBClient(integrationId)
    case 'ASCORA':
      return new AscoraClient(integrationId, integration.companyId || undefined)
    default:
      throw new Error(`Unsupported provider: ${integration.provider}`)
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
  codeChallenge?: string
): string {
  switch (provider) {
    case 'SERVICEM8':
      return new ServiceM8Client(integrationId).getAuthUrl(redirectUri, state)
    case 'XERO':
      return new XeroClient(integrationId).getAuthUrl(redirectUri, state, codeChallenge)
    case 'QUICKBOOKS':
      return new QuickBooksClient(integrationId).getAuthUrl(redirectUri, state)
    case 'MYOB':
      return new MYOBClient(integrationId).getAuthUrl(redirectUri, state)
    case 'ASCORA':
      return new AscoraClient(integrationId).getAuthUrl(redirectUri, state)
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}
