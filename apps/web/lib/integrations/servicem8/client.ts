/**
 * ServiceM8 Integration Client
 * Reference implementation for OAuth + API integration
 */

import {
  BaseIntegrationClient,
  type ExternalClientData,
  type ExternalJobData,
  type TokenResponse,
  getClientId,
  getClientSecret,
} from '../base-client'
import {
  getTokens,
  storeTokens,
  markIntegrationError,
  PROVIDER_CONFIG,
} from '../oauth-handler'
import { prisma } from '@/lib/prisma'

interface ServiceM8Client {
  uuid: string
  active: number
  edit_date: string
  company_name: string
  first: string
  last: string
  email: string
  phone: string
  mobile: string
  fax: string
  website: string
  billing_address: string
  billing_address_line_2: string
  billing_address_city: string
  billing_address_state: string
  billing_address_postcode: string
  billing_address_country: string
}

interface ServiceM8Job {
  uuid: string
  active: number
  edit_date: string
  generated_job_id: string
  status: string
  job_address: string
  job_description: string
  company_uuid: string
  date: string
  time: string
  completion_date: string
  total_invoice: number
  badge_uuid: string
  category_uuid: string
}

export class ServiceM8Client extends BaseIntegrationClient {
  constructor(integrationId: string) {
    super(integrationId, 'SERVICEM8')
  }

  /**
   * Get ServiceM8 OAuth authorization URL
   */
  getAuthUrl(redirectUri: string, state: string): string {
    const clientId = getClientId('SERVICEM8')
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: this.config.scopes.join(' '),
    })

    return `${this.config.authUrl}?${params.toString()}`
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string
  ): Promise<TokenResponse> {
    const clientId = getClientId('SERVICEM8')
    const clientSecret = getClientSecret('SERVICEM8')

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token exchange failed: ${error}`)
    }

    const tokenResponse: TokenResponse = await response.json()
    await this.handleTokenResponse(tokenResponse)

    return tokenResponse
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(): Promise<void> {
    const tokens = await getTokens(this.integrationId)

    if (!tokens.refreshToken) {
      throw new Error('No refresh token available')
    }

    const clientId = getClientId('SERVICEM8')
    const clientSecret = getClientSecret('SERVICEM8')

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refreshToken,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      await markIntegrationError(this.integrationId, `Token refresh failed: ${error}`)
      throw new Error(`Token refresh failed: ${error}`)
    }

    const tokenResponse: TokenResponse = await response.json()
    await storeTokens(
      this.integrationId,
      tokenResponse.access_token,
      tokenResponse.refresh_token || tokens.refreshToken,
      tokenResponse.expires_in
    )
  }

  /**
   * Fetch clients from ServiceM8
   */
  async fetchClients(): Promise<ExternalClientData[]> {
    try {
      const clients = await this.makeRequest<ServiceM8Client[]>(
        '/client.json?%24filter=active%20eq%201'
      )

      const mappedClients: ExternalClientData[] = clients.map((client) => ({
        externalId: client.uuid,
        name: client.company_name || `${client.first} ${client.last}`.trim(),
        email: client.email || undefined,
        phone: client.phone || client.mobile || undefined,
        address: this.formatAddress(client),
        rawData: client as unknown as Record<string, unknown>,
      }))

      await this.logSyncResult('CLIENTS', mappedClients.length)
      return mappedClients
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await this.logSyncResult('CLIENTS', 0, 0, errorMessage)
      throw error
    }
  }

  /**
   * Fetch jobs from ServiceM8
   */
  async fetchJobs(): Promise<ExternalJobData[]> {
    try {
      const jobs = await this.makeRequest<ServiceM8Job[]>(
        '/job.json?%24filter=active%20eq%201'
      )

      const mappedJobs: ExternalJobData[] = jobs.map((job) => ({
        externalId: job.uuid,
        title: job.generated_job_id || `Job ${job.uuid.slice(0, 8)}`,
        status: this.mapJobStatus(job.status),
        clientExternalId: job.company_uuid || undefined,
        address: job.job_address || undefined,
        description: job.job_description || undefined,
        rawData: job as unknown as Record<string, unknown>,
      }))

      await this.logSyncResult('JOBS', mappedJobs.length)
      return mappedJobs
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await this.logSyncResult('JOBS', 0, 0, errorMessage)
      throw error
    }
  }

  /**
   * Sync clients to database
   */
  async syncClients(): Promise<number> {
    const clients = await this.fetchClients()
    let synced = 0

    for (const client of clients) {
      await prisma.externalClient.upsert({
        where: {
          integrationId_externalId: {
            integrationId: this.integrationId,
            externalId: client.externalId,
          },
        },
        create: {
          integrationId: this.integrationId,
          externalId: client.externalId,
          name: client.name,
          email: client.email,
          phone: client.phone,
          address: client.address,
          rawData: client.rawData,
        },
        update: {
          name: client.name,
          email: client.email,
          phone: client.phone,
          address: client.address,
          rawData: client.rawData,
          lastSyncedAt: new Date(),
        },
      })
      synced++
    }

    return synced
  }

  /**
   * Sync jobs to database
   */
  async syncJobs(): Promise<number> {
    const jobs = await this.fetchJobs()
    let synced = 0

    for (const job of jobs) {
      await prisma.externalJob.upsert({
        where: {
          integrationId_externalId: {
            integrationId: this.integrationId,
            externalId: job.externalId,
          },
        },
        create: {
          integrationId: this.integrationId,
          externalId: job.externalId,
          title: job.title,
          status: job.status,
          clientExternalId: job.clientExternalId,
          address: job.address,
          description: job.description,
          rawData: job.rawData,
        },
        update: {
          title: job.title,
          status: job.status,
          clientExternalId: job.clientExternalId,
          address: job.address,
          description: job.description,
          rawData: job.rawData,
          lastSyncedAt: new Date(),
        },
      })
      synced++
    }

    return synced
  }

  /**
   * Format address from ServiceM8 client
   */
  private formatAddress(client: ServiceM8Client): string | undefined {
    const parts = [
      client.billing_address,
      client.billing_address_line_2,
      client.billing_address_city,
      client.billing_address_state,
      client.billing_address_postcode,
    ].filter(Boolean)

    return parts.length > 0 ? parts.join(', ') : undefined
  }

  /**
   * Map ServiceM8 job status to standard status
   */
  private mapJobStatus(status: string): string {
    const statusMap: Record<string, string> = {
      Quote: 'QUOTE',
      'Work Order': 'SCHEDULED',
      'In Progress': 'IN_PROGRESS',
      Completed: 'COMPLETED',
      Unsuccessful: 'CANCELLED',
    }
    return statusMap[status] || status
  }
}

/**
 * Create ServiceM8 client for an integration
 */
export async function createServiceM8Client(integrationId: string): Promise<ServiceM8Client> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  })

  if (!integration || integration.provider !== 'SERVICEM8') {
    throw new Error('Invalid ServiceM8 integration')
  }

  return new ServiceM8Client(integrationId)
}
