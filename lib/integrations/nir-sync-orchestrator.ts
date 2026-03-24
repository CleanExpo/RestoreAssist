/**
 * NIR Sync Orchestrator
 *
 * Single entry point for syncing a completed NIR to any or all connected
 * integrations. Called after a NIR report is submitted and approved.
 *
 * Routing logic:
 *   - Accounting platforms (Xero, QBO, MYOB): sync as invoice
 *   - Job management platforms (ServiceM8, Ascora): sync as job + line items
 *
 * The orchestrator is resilient: if one platform fails, it logs the error
 * and continues with the others. It returns a summary of all sync results.
 *
 * Usage:
 *   const results = await syncNIRToAllConnectedIntegrations(userId, nirPayload)
 *
 * Returns:
 *   { provider: string, status: 'success' | 'error', externalId?: string, error?: string }[]
 */

import { prisma } from '@/lib/prisma'
import { syncNIRJobToXero } from './xero/nir-sync'
import { syncNIRJobToQuickBooks } from './quickbooks/nir-sync'
import { syncNIRJobToMYOB } from './myob/nir-sync'
import { syncNIRJobToServiceM8 } from './servicem8/nir-sync'
import { syncNIRJobToAscora } from './ascora/nir-sync'
import type { NIRJobPayload } from './xero/nir-sync'

export type { NIRJobPayload } from './xero/nir-sync'

export interface NIRSyncResult {
  integrationId: string
  provider: string
  status: 'success' | 'error' | 'skipped'
  externalId?: string
  externalReference?: string
  error?: string
}

/**
 * Sync a NIR job payload to all CONNECTED integrations for a given user.
 * Errors are captured per-provider and do not abort the overall sync.
 */
export async function syncNIRToAllConnectedIntegrations(
  userId: string,
  payload: NIRJobPayload
): Promise<NIRSyncResult[]> {
  // Get all connected integrations for this user
  const integrations = await prisma.integration.findMany({
    where: {
      userId,
      status: 'CONNECTED',
    },
    select: { id: true, provider: true, name: true },
  })

  if (integrations.length === 0) {
    return []
  }

  const results: NIRSyncResult[] = await Promise.all(
    integrations.map(async (integration) => {
      try {
        switch (integration.provider) {
          case 'XERO': {
            const r = await syncNIRJobToXero(integration.id, payload)
            return {
              integrationId: integration.id,
              provider: 'XERO',
              status: 'success' as const,
              externalId: r.xeroInvoiceId,
              externalReference: r.xeroInvoiceNumber,
            }
          }
          case 'QUICKBOOKS': {
            const r = await syncNIRJobToQuickBooks(integration.id, payload)
            return {
              integrationId: integration.id,
              provider: 'QUICKBOOKS',
              status: 'success' as const,
              externalId: r.qboInvoiceId,
              externalReference: r.qboDocNumber,
            }
          }
          case 'MYOB': {
            const r = await syncNIRJobToMYOB(integration.id, payload)
            return {
              integrationId: integration.id,
              provider: 'MYOB',
              status: 'success' as const,
              externalId: r.myobSaleId,
            }
          }
          case 'SERVICEM8': {
            const r = await syncNIRJobToServiceM8(integration.id, payload)
            return {
              integrationId: integration.id,
              provider: 'SERVICEM8',
              status: 'success' as const,
              externalId: r.sm8JobUuid,
              externalReference: r.sm8JobNumber,
            }
          }
          case 'ASCORA': {
            const r = await syncNIRJobToAscora(integration.id, payload)
            return {
              integrationId: integration.id,
              provider: 'ASCORA',
              status: 'success' as const,
              externalId: r.ascoraJobId,
              externalReference: r.ascoraJobNumber,
            }
          }
          default:
            return {
              integrationId: integration.id,
              provider: integration.provider,
              status: 'skipped' as const,
              error: `Unknown provider: ${integration.provider}`,
            }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[NIR Sync] ${integration.provider} sync failed:`, message)
        return {
          integrationId: integration.id,
          provider: integration.provider,
          status: 'error' as const,
          error: message,
        }
      }
    })
  )

  return results
}

/**
 * Sync a NIR job to a SPECIFIC integration only.
 * Useful for manual re-sync or selective sync.
 */
export async function syncNIRToSpecificIntegration(
  integrationId: string,
  payload: NIRJobPayload
): Promise<NIRSyncResult> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { id: true, provider: true, status: true },
  })

  if (!integration) {
    return { integrationId, provider: 'UNKNOWN', status: 'error', error: 'Integration not found' }
  }

  if (integration.status !== 'CONNECTED') {
    return { integrationId, provider: integration.provider, status: 'skipped', error: `Integration status: ${integration.status}` }
  }

  // Delegate to the full orchestrator with a single-integration filter
  const integration_full = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { userId: true },
  })

  if (!integration_full) {
    return { integrationId, provider: integration.provider, status: 'error', error: 'Could not determine user ID' }
  }

  // Run sync directly
  try {
    switch (integration.provider) {
      case 'XERO': {
        const r = await syncNIRJobToXero(integrationId, payload)
        return { integrationId, provider: 'XERO', status: 'success', externalId: r.xeroInvoiceId, externalReference: r.xeroInvoiceNumber }
      }
      case 'QUICKBOOKS': {
        const r = await syncNIRJobToQuickBooks(integrationId, payload)
        return { integrationId, provider: 'QUICKBOOKS', status: 'success', externalId: r.qboInvoiceId, externalReference: r.qboDocNumber }
      }
      case 'MYOB': {
        const r = await syncNIRJobToMYOB(integrationId, payload)
        return { integrationId, provider: 'MYOB', status: 'success', externalId: r.myobSaleId }
      }
      case 'SERVICEM8': {
        const r = await syncNIRJobToServiceM8(integrationId, payload)
        return { integrationId, provider: 'SERVICEM8', status: 'success', externalId: r.sm8JobUuid, externalReference: r.sm8JobNumber }
      }
      case 'ASCORA': {
        const r = await syncNIRJobToAscora(integrationId, payload)
        return { integrationId, provider: 'ASCORA', status: 'success', externalId: r.ascoraJobId, externalReference: r.ascoraJobNumber }
      }
      default:
        return { integrationId, provider: integration.provider, status: 'skipped', error: `Unknown provider` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { integrationId, provider: integration.provider, status: 'error', error: message }
  }
}
