/**
 * Xero Integration Client
 * OAuth 2.0 with PKCE support
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
  generatePKCE,
  PROVIDER_CONFIG,
} from '../oauth-handler'
import { prisma } from '@/lib/prisma'

interface XeroContact {
  ContactID: string
  ContactStatus: string
  Name: string
  FirstName?: string
  LastName?: string
  EmailAddress?: string
  Phones?: Array<{
    PhoneType: string
    PhoneNumber?: string
  }>
  Addresses?: Array<{
    AddressType: string
    AddressLine1?: string
    AddressLine2?: string
    City?: string
    Region?: string
    PostalCode?: string
    Country?: string
  }>
  IsCustomer: boolean
  IsSupplier: boolean
}

interface XeroInvoice {
  InvoiceID: string
  InvoiceNumber: string
  Type: string
  Status: string
  Contact?: {
    ContactID: string
    Name: string
  }
  LineItems?: Array<{
    Description?: string
  }>
  Reference?: string
  Total?: number
  DateString?: string
}

interface XeroContactsResponse {
  Contacts: XeroContact[]
}

interface XeroInvoicesResponse {
  Invoices: XeroInvoice[]
}

interface XeroTenantConnection {
  id: string
  tenantId: string
  tenantName: string
  tenantType: string
}

export class XeroClient extends BaseIntegrationClient {
  private tenantId: string | null = null

  constructor(integrationId: string, tenantId?: string) {
    super(integrationId, 'XERO')
    this.tenantId = tenantId || null
  }

  /**
   * Get Xero OAuth authorization URL with PKCE
   */
  getAuthUrl(redirectUri: string, state: string, codeChallenge?: string): string {
    const clientId = getClientId('XERO')
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: this.config.scopes.join(' '),
    })

    if (codeChallenge) {
      params.set('code_challenge', codeChallenge)
      params.set('code_challenge_method', 'S256')
    }

    return `${this.config.authUrl}?${params.toString()}`
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<TokenResponse> {
    const clientId = getClientId('XERO')
    const clientSecret = getClientSecret('XERO')

    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
    }

    if (codeVerifier) {
      body.code_verifier = codeVerifier
    }

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams(body),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token exchange failed: ${error}`)
    }

    const tokenResponse: TokenResponse = await response.json()
    await this.handleTokenResponse(tokenResponse)

    // Fetch tenant connections and store the first one
    await this.fetchAndStoreTenant()

    return tokenResponse
  }

  /**
   * Fetch and store Xero tenant information
   */
  private async fetchAndStoreTenant(): Promise<void> {
    const tokens = await getTokens(this.integrationId)
    if (!tokens.accessToken) return

    const response = await fetch('https://api.xero.com/connections', {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    })

    if (response.ok) {
      const connections: XeroTenantConnection[] = await response.json()
      if (connections.length > 0) {
        this.tenantId = connections[0].tenantId
        await prisma.integration.update({
          where: { id: this.integrationId },
          data: { tenantId: connections[0].tenantId },
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

    const clientId = getClientId('XERO')
    const clientSecret = getClientSecret('XERO')

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
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
   * Make Xero API request with tenant header
   */
  protected async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Ensure we have tenant ID
    if (!this.tenantId) {
      const integration = await prisma.integration.findUnique({
        where: { id: this.integrationId },
        select: { tenantId: true },
      })
      this.tenantId = integration?.tenantId || null
    }

    if (!this.tenantId) {
      throw new Error('No Xero tenant connected')
    }

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
    headers.set('xero-tenant-id', this.tenantId)
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
   * Fetch contacts from Xero
   */
  async fetchClients(): Promise<ExternalClientData[]> {
    try {
      const response = await this.makeRequest<XeroContactsResponse>(
        '/Contacts?where=IsCustomer=true'
      )

      const mappedClients: ExternalClientData[] = response.Contacts.map((contact) => ({
        externalId: contact.ContactID,
        name: contact.Name,
        email: contact.EmailAddress || undefined,
        phone: this.getPhoneNumber(contact),
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
   * Fetch invoices as jobs from Xero
   * Note: Xero doesn't have native jobs, so we use invoices
   */
  async fetchJobs(): Promise<ExternalJobData[]> {
    try {
      const response = await this.makeRequest<XeroInvoicesResponse>(
        '/Invoices?where=Type="ACCREC"&order=DateString DESC'
      )

      const mappedJobs: ExternalJobData[] = response.Invoices.map((invoice) => ({
        externalId: invoice.InvoiceID,
        title: invoice.InvoiceNumber || `Invoice ${invoice.InvoiceID.slice(0, 8)}`,
        status: this.mapInvoiceStatus(invoice.Status),
        clientExternalId: invoice.Contact?.ContactID,
        description: invoice.Reference || invoice.LineItems?.[0]?.Description,
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
   * Sync jobs (invoices) to database
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

  private getPhoneNumber(contact: XeroContact): string | undefined {
    const phone = contact.Phones?.find(
      (p) => p.PhoneType === 'DEFAULT' || p.PhoneType === 'MOBILE'
    )
    return phone?.PhoneNumber || undefined
  }

  private formatAddress(contact: XeroContact): string | undefined {
    const address = contact.Addresses?.find((a) => a.AddressType === 'POBOX' || a.AddressType === 'STREET')
    if (!address) return undefined

    const parts = [
      address.AddressLine1,
      address.AddressLine2,
      address.City,
      address.Region,
      address.PostalCode,
    ].filter(Boolean)

    return parts.length > 0 ? parts.join(', ') : undefined
  }

  private mapInvoiceStatus(status: string): string {
    const statusMap: Record<string, string> = {
      DRAFT: 'DRAFT',
      SUBMITTED: 'PENDING',
      AUTHORISED: 'ACTIVE',
      PAID: 'COMPLETED',
      VOIDED: 'CANCELLED',
    }
    return statusMap[status] || status
  }
}

export async function createXeroClient(integrationId: string): Promise<XeroClient> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  })

  if (!integration || integration.provider !== 'XERO') {
    throw new Error('Invalid Xero integration')
  }

  return new XeroClient(integrationId, integration.tenantId || undefined)
}
