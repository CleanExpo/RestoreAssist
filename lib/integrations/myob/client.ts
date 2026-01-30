/**
 * MYOB Integration Client
 * OAuth 2.0 for MYOB AccountRight Live
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
} from '../oauth-handler'
import { prisma } from '@/lib/prisma'

interface MYOBContact {
  UID: string
  CompanyName?: string
  FirstName?: string
  LastName?: string
  IsIndividual: boolean
  DisplayID: string
  Addresses?: Array<{
    Location: number
    Street?: string
    City?: string
    State?: string
    PostCode?: string
    Country?: string
    Phone1?: string
    Email?: string
  }>
  CurrentBalance?: number
}

interface MYOBJob {
  UID: string
  Number: string
  Name: string
  Description?: string
  IsActive: boolean
  Contact?: {
    UID: string
    Name: string
  }
  StartDate?: string
  FinishDate?: string
  Manager?: string
  PercentComplete?: number
}

interface MYOBCompanyFile {
  Id: string
  Name: string
  LibraryPath: string
  ProductVersion: string
  Country: string
  Uri: string
}

interface MYOBPagedResponse<T> {
  Items: T[]
  Count: number
  NextPageLink?: string
}

export class MYOBClient extends BaseIntegrationClient {
  private companyFileUri: string | null = null

  constructor(integrationId: string, companyFileUri?: string) {
    super(integrationId, 'MYOB')
    this.companyFileUri = companyFileUri || null
  }

  /**
   * Get MYOB OAuth authorization URL
   */
  getAuthUrl(redirectUri: string, state: string): string {
    const clientId = getClientId('MYOB')
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
    const clientId = getClientId('MYOB')
    const clientSecret = getClientSecret('MYOB')

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

    // Fetch company files and store the first one
    await this.fetchAndStoreCompanyFile()

    return tokenResponse
  }

  /**
   * Fetch and store MYOB company file
   */
  private async fetchAndStoreCompanyFile(): Promise<void> {
    const tokens = await getTokens(this.integrationId)
    if (!tokens.accessToken) return

    const clientId = getClientId('MYOB')
    const response = await fetch(`${this.config.apiBaseUrl}/`, {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'x-myobapi-key': clientId,
        'x-myobapi-version': 'v2',
      },
    })

    if (response.ok) {
      const companyFiles: MYOBCompanyFile[] = await response.json()
      if (companyFiles.length > 0) {
        this.companyFileUri = companyFiles[0].Uri
        await prisma.integration.update({
          where: { id: this.integrationId },
          data: { tenantId: companyFiles[0].Id },
        })
      }
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

    const clientId = getClientId('MYOB')
    const clientSecret = getClientSecret('MYOB')

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
   * Make MYOB API request
   */
  protected async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.companyFileUri) {
      // Try to get from company files list
      const integration = await prisma.integration.findUnique({
        where: { id: this.integrationId },
        select: { tenantId: true },
      })

      if (integration?.tenantId) {
        // Reconstruct URI from tenant ID
        this.companyFileUri = `${this.config.apiBaseUrl}/${integration.tenantId}`
      }
    }

    if (!this.companyFileUri) {
      throw new Error('No MYOB company file connected')
    }

    const tokens = await getTokens(this.integrationId)
    if (!tokens.accessToken) {
      throw new Error('No access token available')
    }

    if (tokens.isExpired && tokens.refreshToken) {
      await this.refreshAccessToken()
    }

    const clientId = getClientId('MYOB')
    const url = `${this.companyFileUri}${endpoint}`
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${tokens.accessToken}`)
    headers.set('x-myobapi-key', clientId)
    headers.set('x-myobapi-version', 'v2')
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
   * Fetch customers from MYOB
   */
  async fetchClients(): Promise<ExternalClientData[]> {
    try {
      const response = await this.makeRequest<MYOBPagedResponse<MYOBContact>>(
        '/Contact/Customer'
      )

      const mappedClients: ExternalClientData[] = response.Items.map((contact) => ({
        externalId: contact.UID,
        name: contact.CompanyName || `${contact.FirstName || ''} ${contact.LastName || ''}`.trim() || contact.DisplayID,
        email: contact.Addresses?.[0]?.Email || undefined,
        phone: contact.Addresses?.[0]?.Phone1 || undefined,
        address: this.formatAddress(contact),
        rawData: contact as unknown as Record<string, unknown>,
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
   * Fetch jobs from MYOB
   */
  async fetchJobs(): Promise<ExternalJobData[]> {
    try {
      const response = await this.makeRequest<MYOBPagedResponse<MYOBJob>>(
        '/GeneralLedger/Job?$filter=IsActive eq true'
      )

      const mappedJobs: ExternalJobData[] = response.Items.map((job) => ({
        externalId: job.UID,
        title: job.Name || job.Number,
        status: this.mapJobStatus(job),
        clientExternalId: job.Contact?.UID,
        description: job.Description,
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
          description: job.description,
          rawData: job.rawData,
        },
        update: {
          title: job.title,
          status: job.status,
          clientExternalId: job.clientExternalId,
          description: job.description,
          rawData: job.rawData,
          lastSyncedAt: new Date(),
        },
      })
      synced++
    }

    return synced
  }

  private formatAddress(contact: MYOBContact): string | undefined {
    const address = contact.Addresses?.[0]
    if (!address) return undefined

    const parts = [
      address.Street,
      address.City,
      address.State,
      address.PostCode,
    ].filter(Boolean)

    return parts.length > 0 ? parts.join(', ') : undefined
  }

  private mapJobStatus(job: MYOBJob): string {
    if (!job.IsActive) return 'INACTIVE'
    if (job.PercentComplete === 100) return 'COMPLETED'
    if (job.PercentComplete && job.PercentComplete > 0) return 'IN_PROGRESS'
    return 'ACTIVE'
  }
}

export async function createMYOBClient(integrationId: string): Promise<MYOBClient> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  })

  if (!integration || integration.provider !== 'MYOB') {
    throw new Error('Invalid MYOB integration')
  }

  return new MYOBClient(integrationId)
}
