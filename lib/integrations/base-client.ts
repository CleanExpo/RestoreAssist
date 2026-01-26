/**
 * Base Integration Client
 * Abstract class that all provider clients extend
 */

import {
  getTokens,
  storeTokens,
  markIntegrationError,
  logSync,
  PROVIDER_CONFIG,
  type IntegrationProvider,
} from './oauth-handler'

export interface ExternalClientData {
  externalId: string
  name: string
  email?: string
  phone?: string
  address?: string
  rawData: Record<string, unknown>
}

export interface ExternalJobData {
  externalId: string
  title: string
  status?: string
  clientExternalId?: string
  address?: string
  description?: string
  rawData: Record<string, unknown>
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

export abstract class BaseIntegrationClient {
  protected integrationId: string
  protected provider: IntegrationProvider
  protected config: typeof PROVIDER_CONFIG[IntegrationProvider]

  constructor(integrationId: string, provider: IntegrationProvider) {
    this.integrationId = integrationId
    this.provider = provider
    this.config = PROVIDER_CONFIG[provider]
  }

  /**
   * Get OAuth authorization URL
   */
  abstract getAuthUrl(redirectUri: string, state: string): string

  /**
   * Exchange authorization code for tokens
   */
  abstract exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<TokenResponse>

  /**
   * Refresh access token using refresh token
   */
  abstract refreshAccessToken(): Promise<void>

  /**
   * Fetch clients/customers from the external service
   */
  abstract fetchClients(): Promise<ExternalClientData[]>

  /**
   * Fetch jobs/projects from the external service
   */
  abstract fetchJobs(): Promise<ExternalJobData[]>

  /**
   * Make an authenticated API request
   */
  protected async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const tokens = await getTokens(this.integrationId)

    if (!tokens.accessToken) {
      throw new Error('No access token available')
    }

    // Check if token is expired and refresh if needed
    if (tokens.isExpired && tokens.refreshToken) {
      await this.refreshAccessToken()
      // Re-fetch tokens after refresh
      const newTokens = await getTokens(this.integrationId)
      if (!newTokens.accessToken) {
        throw new Error('Failed to refresh access token')
      }
      tokens.accessToken = newTokens.accessToken
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
   * Store tokens after successful OAuth exchange
   */
  protected async handleTokenResponse(tokenResponse: TokenResponse): Promise<void> {
    await storeTokens(
      this.integrationId,
      tokenResponse.access_token,
      tokenResponse.refresh_token,
      tokenResponse.expires_in
    )
  }

  /**
   * Log a sync operation
   */
  protected async logSyncResult(
    syncType: 'CLIENTS' | 'JOBS' | 'FULL',
    processed: number,
    failed: number = 0,
    error?: string
  ): Promise<void> {
    const status = error ? 'FAILED' : failed > 0 ? 'PARTIAL' : 'SUCCESS'
    await logSync(this.integrationId, syncType, status, processed, failed, error)
  }
}

/**
 * Get provider client ID from environment
 */
export function getClientId(provider: IntegrationProvider): string {
  const envKey = `${provider}_CLIENT_ID`
  const clientId = process.env[envKey]
  if (!clientId) {
    throw new Error(`${envKey} is not configured`)
  }
  return clientId
}

/**
 * Get provider client secret from environment
 */
export function getClientSecret(provider: IntegrationProvider): string {
  const envKey = `${provider}_CLIENT_SECRET`
  const clientSecret = process.env[envKey]
  if (!clientSecret) {
    throw new Error(`${envKey} is not configured`)
  }
  return clientSecret
}
