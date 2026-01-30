/**
 * Ascora Integration Client
 * API Key + OAuth hybrid authentication for Ascora
 */

import {
  BaseIntegrationClient,
  type ExternalClientData,
  type ExternalJobData,
  type TokenResponse,
} from '../base-client'
import {
  getTokens,
  storeTokens,
  markIntegrationError,
} from '../oauth-handler'
import { prisma } from '@/lib/prisma'

interface AscoraCustomer {
  id: string
  name: string
  contact_name?: string
  email?: string
  phone?: string
  mobile?: string
  address_line_1?: string
  address_line_2?: string
  suburb?: string
  state?: string
  postcode?: string
  active: boolean
}

interface AscoraWorkOrder {
  id: string
  number: string
  title?: string
  description?: string
  status: string
  customer_id?: string
  site_address?: string
  created_at: string
  updated_at: string
  completed_at?: string
}

interface AscoraPagedResponse<T> {
  data: T[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
}

/**
 * Get Ascora API key from environment
 */
function getAscoraApiKey(): string {
  const apiKey = process.env.ASCORA_API_KEY
  if (!apiKey) {
    throw new Error('ASCORA_API_KEY is not configured')
  }
  return apiKey
}

/**
 * Get Ascora API secret from environment
 */
function getAscoraApiSecret(): string {
  const apiSecret = process.env.ASCORA_API_SECRET
  if (!apiSecret) {
    throw new Error('ASCORA_API_SECRET is not configured')
  }
  return apiSecret
}

export class AscoraClient extends BaseIntegrationClient {
  private companyId: string | null = null

  constructor(integrationId: string, companyId?: string) {
    super(integrationId, 'ASCORA')
    this.companyId = companyId || null
  }

  /**
   * Get Ascora OAuth authorization URL
   */
  getAuthUrl(redirectUri: string, state: string): string {
    const apiKey = getAscoraApiKey()
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: apiKey,
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
    const apiKey = getAscoraApiKey()
    const apiSecret = getAscoraApiSecret()

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: apiKey,
        client_secret: apiSecret,
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

    // Fetch and store company ID
    await this.fetchAndStoreCompanyId()

    return tokenResponse
  }

  /**
   * Fetch and store Ascora company ID
   */
  private async fetchAndStoreCompanyId(): Promise<void> {
    try {
      const tokens = await getTokens(this.integrationId)
      if (!tokens.accessToken) return

      const response = await fetch(`${this.config.apiBaseUrl}/me`, {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          Accept: 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.company_id) {
          this.companyId = data.company_id
          await prisma.integration.update({
            where: { id: this.integrationId },
            data: { companyId: data.company_id },
          })
        }
      }
    } catch {
      // Silently fail - company ID is optional
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<void> {
    const tokens = await getTokens(this.integrationId)

    if (!tokens.refreshToken) {
      throw new Error('No refresh token available')
    }

    const apiKey = getAscoraApiKey()
    const apiSecret = getAscoraApiSecret()

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: apiKey,
        client_secret: apiSecret,
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
   * Make Ascora API request
   */
  protected async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const tokens = await getTokens(this.integrationId)
    if (!tokens.accessToken) {
      throw new Error('No access token available')
    }

    if (tokens.isExpired && tokens.refreshToken) {
      await this.refreshAccessToken()
    }

    const url = `${this.config.apiBaseUrl}${endpoint}`
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${tokens.accessToken}`)
    headers.set('Accept', 'application/json')

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      await markIntegrationError(
        this.integrationId,
        `API Error ${response.status}: ${errorText}`
      )
      throw new Error(`API request failed: ${response.status} ${errorText}`)
    }

    return response.json()
  }

  /**
   * Fetch customers from Ascora
   */
  async fetchClients(): Promise<ExternalClientData[]> {
    try {
      const allClients: ExternalClientData[] = []
      let page = 1
      let hasMore = true

      while (hasMore) {
        const response = await this.makeRequest<AscoraPagedResponse<AscoraCustomer>>(
          `/customers?page=${page}&per_page=100&active=true`
        )

        const mappedClients = response.data.map((customer) => ({
          externalId: customer.id,
          name: customer.name,
          email: customer.email || undefined,
          phone: customer.phone || customer.mobile || undefined,
          address: this.formatAddress(customer),
          rawData: customer as unknown as Record<string, unknown>,
        }))

        allClients.push(...mappedClients)
        hasMore = page < response.meta.last_page
        page++
      }

      await this.logSyncResult('CLIENTS', allClients.length)
      return allClients
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await this.logSyncResult('CLIENTS', 0, 0, errorMessage)
      throw error
    }
  }

  /**
   * Fetch work orders from Ascora
   */
  async fetchJobs(): Promise<ExternalJobData[]> {
    try {
      const allJobs: ExternalJobData[] = []
      let page = 1
      let hasMore = true

      while (hasMore) {
        const response = await this.makeRequest<AscoraPagedResponse<AscoraWorkOrder>>(
          `/work-orders?page=${page}&per_page=100`
        )

        const mappedJobs = response.data.map((workOrder) => ({
          externalId: workOrder.id,
          title: workOrder.title || workOrder.number,
          status: this.mapJobStatus(workOrder.status),
          clientExternalId: workOrder.customer_id || undefined,
          address: workOrder.site_address || undefined,
          description: workOrder.description,
          rawData: workOrder as unknown as Record<string, unknown>,
        }))

        allJobs.push(...mappedJobs)
        hasMore = page < response.meta.last_page
        page++
      }

      await this.logSyncResult('JOBS', allJobs.length)
      return allJobs
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

  private formatAddress(customer: AscoraCustomer): string | undefined {
    const parts = [
      customer.address_line_1,
      customer.address_line_2,
      customer.suburb,
      customer.state,
      customer.postcode,
    ].filter(Boolean)

    return parts.length > 0 ? parts.join(', ') : undefined
  }

  private mapJobStatus(status: string): string {
    const statusMap: Record<string, string> = {
      draft: 'DRAFT',
      pending: 'PENDING',
      scheduled: 'SCHEDULED',
      in_progress: 'IN_PROGRESS',
      completed: 'COMPLETED',
      cancelled: 'CANCELLED',
      invoiced: 'INVOICED',
    }
    return statusMap[status.toLowerCase()] || status.toUpperCase()
  }
}

export async function createAscoraClient(integrationId: string): Promise<AscoraClient> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  })

  if (!integration || integration.provider !== 'ASCORA') {
    throw new Error('Invalid Ascora integration')
  }

  return new AscoraClient(integrationId, integration.companyId || undefined)
}
