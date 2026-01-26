/**
 * QuickBooks Integration Client
 * OAuth 2.0 for Intuit QuickBooks Online
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

interface QuickBooksCustomer {
  Id: string
  DisplayName: string
  CompanyName?: string
  GivenName?: string
  FamilyName?: string
  PrimaryEmailAddr?: {
    Address: string
  }
  PrimaryPhone?: {
    FreeFormNumber: string
  }
  BillAddr?: {
    Line1?: string
    Line2?: string
    City?: string
    CountrySubDivisionCode?: string
    PostalCode?: string
  }
  Active: boolean
}

interface QuickBooksInvoice {
  Id: string
  DocNumber: string
  TxnDate: string
  DueDate?: string
  TotalAmt: number
  Balance: number
  CustomerRef?: {
    value: string
    name: string
  }
  Line?: Array<{
    Description?: string
  }>
  PrivateNote?: string
}

interface QuickBooksQueryResponse<T> {
  QueryResponse: {
    Customer?: T[]
    Invoice?: T[]
    startPosition: number
    maxResults: number
  }
}

export class QuickBooksClient extends BaseIntegrationClient {
  private realmId: string | null = null

  constructor(integrationId: string, realmId?: string) {
    super(integrationId, 'QUICKBOOKS')
    this.realmId = realmId || null
  }

  /**
   * Get QuickBooks OAuth authorization URL
   */
  getAuthUrl(redirectUri: string, state: string): string {
    const clientId = getClientId('QUICKBOOKS')
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
    const clientId = getClientId('QUICKBOOKS')
    const clientSecret = getClientSecret('QUICKBOOKS')

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
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
   * Store realm ID from callback
   */
  async setRealmId(realmId: string): Promise<void> {
    this.realmId = realmId
    await prisma.integration.update({
      where: { id: this.integrationId },
      data: { realmId },
    })
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<void> {
    const tokens = await getTokens(this.integrationId)

    if (!tokens.refreshToken) {
      throw new Error('No refresh token available')
    }

    const clientId = getClientId('QUICKBOOKS')
    const clientSecret = getClientSecret('QUICKBOOKS')

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
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
   * Make QuickBooks API request
   */
  protected async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.realmId) {
      const integration = await prisma.integration.findUnique({
        where: { id: this.integrationId },
        select: { realmId: true },
      })
      this.realmId = integration?.realmId || null
    }

    if (!this.realmId) {
      throw new Error('No QuickBooks realm connected')
    }

    const tokens = await getTokens(this.integrationId)
    if (!tokens.accessToken) {
      throw new Error('No access token available')
    }

    if (tokens.isExpired && tokens.refreshToken) {
      await this.refreshAccessToken()
    }

    const url = `${this.config.apiBaseUrl}/${this.realmId}${endpoint}`
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
   * Fetch customers from QuickBooks
   */
  async fetchClients(): Promise<ExternalClientData[]> {
    try {
      const response = await this.makeRequest<QuickBooksQueryResponse<QuickBooksCustomer>>(
        "/query?query=SELECT * FROM Customer WHERE Active = true MAXRESULTS 1000"
      )

      const customers = response.QueryResponse.Customer || []
      const mappedClients: ExternalClientData[] = customers.map((customer) => ({
        externalId: customer.Id,
        name: customer.DisplayName || customer.CompanyName || `${customer.GivenName} ${customer.FamilyName}`.trim(),
        email: customer.PrimaryEmailAddr?.Address || undefined,
        phone: customer.PrimaryPhone?.FreeFormNumber || undefined,
        address: this.formatAddress(customer),
        rawData: customer as unknown as Record<string, unknown>,
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
   * Fetch invoices as jobs from QuickBooks
   */
  async fetchJobs(): Promise<ExternalJobData[]> {
    try {
      const response = await this.makeRequest<QuickBooksQueryResponse<QuickBooksInvoice>>(
        "/query?query=SELECT * FROM Invoice ORDERBY TxnDate DESC MAXRESULTS 1000"
      )

      const invoices = response.QueryResponse.Invoice || []
      const mappedJobs: ExternalJobData[] = invoices.map((invoice) => ({
        externalId: invoice.Id,
        title: invoice.DocNumber || `Invoice ${invoice.Id}`,
        status: this.mapInvoiceStatus(invoice),
        clientExternalId: invoice.CustomerRef?.value,
        description: invoice.PrivateNote || invoice.Line?.[0]?.Description,
        rawData: invoice as unknown as Record<string, unknown>,
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

  private formatAddress(customer: QuickBooksCustomer): string | undefined {
    if (!customer.BillAddr) return undefined

    const parts = [
      customer.BillAddr.Line1,
      customer.BillAddr.Line2,
      customer.BillAddr.City,
      customer.BillAddr.CountrySubDivisionCode,
      customer.BillAddr.PostalCode,
    ].filter(Boolean)

    return parts.length > 0 ? parts.join(', ') : undefined
  }

  private mapInvoiceStatus(invoice: QuickBooksInvoice): string {
    if (invoice.Balance === 0) return 'PAID'
    if (invoice.Balance < invoice.TotalAmt) return 'PARTIAL'
    return 'PENDING'
  }
}

export async function createQuickBooksClient(integrationId: string): Promise<QuickBooksClient> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  })

  if (!integration || integration.provider !== 'QUICKBOOKS') {
    throw new Error('Invalid QuickBooks integration')
  }

  return new QuickBooksClient(integrationId, integration.realmId || undefined)
}
