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
} from "../base-client";
import {
  getTokens,
  storeTokens,
  markIntegrationError,
  disconnectIntegration,
  generatePKCE,
  PROVIDER_CONFIG,
} from "../oauth-handler";
import { prisma } from "@/lib/prisma";
import { isXeroTimeoutError } from "./upstream-errors";

/** Modest page size so each Xero call finishes inside the 15s AbortSignal budget. */
const XERO_PAGE_SIZE = 100;
const XERO_REQUEST_TIMEOUT_MS = 15_000;

/**
 * High-volume Xero orgs reject `where` on Contacts/Invoices (Error 9191919).
 * Prefer unfiltered pagination + client-side filters for reliability.
 */
export function isCustomerContact(contact: {
  IsCustomer?: boolean;
  Name?: string;
}): boolean {
  if (!contact.IsCustomer) return false;
  // Skip nameless stubs that sometimes appear in summary listings.
  return Boolean(contact.Name?.trim());
}

export function isSalesInvoice(invoice: { Type?: string }): boolean {
  return invoice.Type === "ACCREC";
}

interface XeroPagination {
  page?: number;
  pageSize?: number;
  pageCount?: number;
  itemCount?: number;
}

interface XeroContact {
  ContactID: string;
  ContactStatus: string;
  Name: string;
  FirstName?: string;
  LastName?: string;
  EmailAddress?: string;
  Phones?: Array<{
    PhoneType: string;
    PhoneNumber?: string;
  }>;
  Addresses?: Array<{
    AddressType: string;
    AddressLine1?: string;
    AddressLine2?: string;
    City?: string;
    Region?: string;
    PostalCode?: string;
    Country?: string;
  }>;
  IsCustomer: boolean;
  IsSupplier: boolean;
}

interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber: string;
  Type: string;
  Status: string;
  Contact?: {
    ContactID: string;
    Name: string;
  };
  LineItems?: Array<{
    Description?: string;
  }>;
  Reference?: string;
  Total?: number;
  DateString?: string;
}

interface XeroContactsResponse {
  Contacts: XeroContact[];
  pagination?: XeroPagination;
}

interface XeroInvoicesResponse {
  Invoices: XeroInvoice[];
  pagination?: XeroPagination;
}

interface XeroTenantConnection {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
}

export class XeroClient extends BaseIntegrationClient {
  private tenantId: string | null = null;

  constructor(integrationId: string, tenantId?: string) {
    super(integrationId, "XERO");
    this.tenantId = tenantId || null;
  }

  /**
   * Get Xero OAuth authorization URL with PKCE
   */
  getAuthUrl(
    redirectUri: string,
    state: string,
    codeChallenge?: string,
  ): string {
    const clientId = getClientId("XERO");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: this.config.scopes.join(" "),
    });

    if (codeChallenge) {
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }

    return `${this.config.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<TokenResponse> {
    const clientId = getClientId("XERO");
    const clientSecret = getClientSecret("XERO");

    const body: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
    };

    if (codeVerifier) {
      body.code_verifier = codeVerifier;
    }

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokenResponse: TokenResponse = await response.json();
    await this.handleTokenResponse(tokenResponse);

    // Fetch tenant connections and store the first one
    await this.fetchAndStoreTenant();

    return tokenResponse;
  }

  /**
   * Fetch and store Xero tenant information
   */
  private async fetchAndStoreTenant(): Promise<void> {
    const tokens = await getTokens(this.integrationId);
    if (!tokens.accessToken) return;

    const response = await fetch("https://api.xero.com/connections", {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    });

    if (response.ok) {
      const connections: XeroTenantConnection[] = await response.json();
      if (connections.length > 0) {
        this.tenantId = connections[0].tenantId;
        await prisma.integration.update({
          where: { id: this.integrationId },
          data: { tenantId: connections[0].tenantId },
        });
      }
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<void> {
    const tokens = await getTokens(this.integrationId);

    if (!tokens.refreshToken) {
      throw new Error("No refresh token available");
    }

    const clientId = getClientId("XERO");
    // getClientSecret throws "XERO_CLIENT_SECRET is not configured" — mapped
    // to a clear 400 by mapXeroUpstreamError (refresh cannot succeed without it).
    const clientSecret = getClientSecret("XERO");

    let response: Response;
    try {
      response = await fetch(this.config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refreshToken,
        }),
        signal: AbortSignal.timeout(XERO_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (isXeroTimeoutError(err)) {
        const timeoutErr = new Error(
          `Xero token refresh timed out after ${XERO_REQUEST_TIMEOUT_MS}ms`,
        );
        timeoutErr.name = "TimeoutError";
        (timeoutErr as { status?: number }).status = 504;
        throw timeoutErr;
      }
      throw err;
    }

    if (!response.ok) {
      const error = await response.text();
      // RA-6942 — 400 invalid_grant / 401 / 403 means the refresh token is
      // permanently dead (user revoked app, reauth needed). DISCONNECT so the
      // UI can prompt reconnect. Other failures (5xx, network) stay in ERROR
      // so retry can recover.
      const isTerminal =
        response.status === 401 ||
        response.status === 403 ||
        (response.status === 400 && /invalid_grant/i.test(error));
      if (isTerminal) {
        await disconnectIntegration(this.integrationId);
      } else {
        await markIntegrationError(
          this.integrationId,
          `Token refresh failed: ${error}`,
        );
      }
      throw new Error(`Token refresh failed: ${error}`);
    }

    const tokenResponse: TokenResponse = await response.json();
    await storeTokens(
      this.integrationId,
      tokenResponse.access_token,
      tokenResponse.refresh_token || tokens.refreshToken,
      tokenResponse.expires_in,
    );
  }

  /**
   * Make Xero API request with tenant header
   */
  protected async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    // Ensure we have tenant ID
    if (!this.tenantId) {
      const integration = await prisma.integration.findUnique({
        where: { id: this.integrationId },
        select: { tenantId: true },
      });
      this.tenantId = integration?.tenantId || null;
    }

    if (!this.tenantId) {
      throw new Error("No Xero tenant connected");
    }

    let tokens = await getTokens(this.integrationId);
    if (!tokens.accessToken) {
      throw new Error("No access token available");
    }

    // Proactive refresh (same 5-minute window as BaseIntegrationClient / RA-1220)
    // so sync does not race an almost-expired token into a 401.
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    const needsRefresh =
      tokens.isExpired ||
      (tokens.tokenExpiresAt != null &&
        tokens.tokenExpiresAt.getTime() - Date.now() < FIVE_MINUTES_MS);
    if (needsRefresh && tokens.refreshToken) {
      await this.refreshAccessToken();
      // Re-fetch tokens after refresh so the request uses the NEW access token
      tokens = await getTokens(this.integrationId);
      if (!tokens.accessToken) {
        throw new Error("Token refresh failed — no access token after refresh");
      }
    }

    const url = `${this.config.apiBaseUrl}${endpoint}`;
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    headers.set("xero-tenant-id", this.tenantId);
    headers.set("Accept", "application/json");

    // RA-6942 — bound the outbound provider call so a hung connection cannot
    // stall the request indefinitely (mirrors the ABR lookup timeout pattern).
    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(XERO_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (isXeroTimeoutError(err)) {
        const timeoutErr = new Error(
          `Xero request timed out on ${endpoint} after ${XERO_REQUEST_TIMEOUT_MS}ms`,
        );
        timeoutErr.name = "TimeoutError";
        (timeoutErr as { status?: number }).status = 504;
        throw timeoutErr;
      }
      throw err;
    }

    if (!response.ok) {
      const errorText = await response.text();
      await markIntegrationError(
        this.integrationId,
        `API Error ${response.status}: ${errorText}`,
      );
      const apiErr = new Error(
        `API request failed: ${response.status} ${errorText}`,
      );
      (apiErr as { status?: number }).status = response.status;
      throw apiErr;
    }

    return response.json();
  }

  /**
   * Fetch contacts from Xero (paginated, summaryOnly — Ascora-style page budget).
   *
   * Do NOT send `where=IsCustomer==true`: high-volume orgs reject Contact
   * where-filters with HighVolumeFilterUnavailableApiException (9191919).
   * Paginate unfiltered and keep customers client-side.
   */
  async fetchClients(): Promise<ExternalClientData[]> {
    try {
      const allClients: ExternalClientData[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        // No `where` — see HighVolumeFilterUnavailableApiException (9191919).
        // summaryOnly keeps each page inside the 15s AbortSignal budget;
        // pageSize=100 mirrors the Ascora sync page-size fix.
        const response = await this.makeRequest<XeroContactsResponse>(
          `/Contacts?summaryOnly=true&page=${page}&pageSize=${XERO_PAGE_SIZE}`,
        );

        const contacts = response.Contacts ?? [];
        for (const contact of contacts) {
          if (!isCustomerContact(contact)) continue;
          allClients.push({
            externalId: contact.ContactID,
            name: contact.Name,
            email: contact.EmailAddress || undefined,
            phone: this.getPhoneNumber(contact),
            address: this.formatAddress(contact),
            rawData: contact as unknown as Record<string, unknown>,
          });
        }

        hasMore = this.hasMoreXeroPages(response.pagination, contacts.length, page);
        page++;
      }

      await this.logSyncResult("CLIENTS", allClients.length);
      return allClients;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.logSyncResult("CLIENTS", 0, 0, errorMessage);
      throw error;
    }
  }

  /**
   * Fetch invoices as jobs from Xero (paginated, summaryOnly).
   * Note: Xero doesn't have native jobs, so we use ACCREC invoices.
   *
   * Do NOT send `where=Type=="ACCREC"`: the same high-volume filter rejection
   * (9191919) that hits Contacts can apply to Invoices. Filter ACCREC locally.
   *
   * Do NOT send `order=DateString` with `summaryOnly=true`: Xero returns 400
   * ("Ordering by DateString is unavailable on this endpoint when using the
   * summaryOnly flag"). Paginate unfiltered without order.
   */
  async fetchJobs(): Promise<ExternalJobData[]> {
    try {
      const allJobs: ExternalJobData[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.makeRequest<XeroInvoicesResponse>(
          `/Invoices?summaryOnly=true&page=${page}&pageSize=${XERO_PAGE_SIZE}`,
        );

        const invoices = response.Invoices ?? [];
        for (const invoice of invoices) {
          if (!isSalesInvoice(invoice)) continue;
          allJobs.push({
            externalId: invoice.InvoiceID,
            title:
              invoice.InvoiceNumber ||
              `Invoice ${invoice.InvoiceID.slice(0, 8)}`,
            status: this.mapInvoiceStatus(invoice.Status),
            clientExternalId: invoice.Contact?.ContactID,
            description:
              invoice.Reference || invoice.LineItems?.[0]?.Description,
            rawData: invoice as unknown as Record<string, unknown>,
          });
        }

        hasMore = this.hasMoreXeroPages(response.pagination, invoices.length, page);
        page++;
      }

      await this.logSyncResult("JOBS", allJobs.length);
      return allJobs;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.logSyncResult("JOBS", 0, 0, errorMessage);
      throw error;
    }
  }

  /** Prefer pagination.pageCount when present; else stop on a short page. */
  private hasMoreXeroPages(
    pagination: XeroPagination | undefined,
    itemCount: number,
    page: number,
  ): boolean {
    if (pagination?.pageCount != null) {
      return page < pagination.pageCount;
    }
    return itemCount >= XERO_PAGE_SIZE;
  }

  /**
   * Sync clients to database
   */
  async syncClients(): Promise<number> {
    const clients = await this.fetchClients();
    let synced = 0;

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
          rawData: client.rawData as any,
        },
        update: {
          name: client.name,
          email: client.email,
          phone: client.phone,
          address: client.address,
          rawData: client.rawData as any,
          lastSyncedAt: new Date(),
        },
      });
      synced++;
    }

    return synced;
  }

  /**
   * Sync jobs (invoices) to database
   */
  async syncJobs(): Promise<number> {
    const jobs = await this.fetchJobs();
    let synced = 0;

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
          rawData: job.rawData as any,
        },
        update: {
          title: job.title,
          status: job.status,
          clientExternalId: job.clientExternalId,
          description: job.description,
          rawData: job.rawData as any,
          lastSyncedAt: new Date(),
        },
      });
      synced++;
    }

    return synced;
  }

  private getPhoneNumber(contact: XeroContact): string | undefined {
    const phone = contact.Phones?.find(
      (p) => p.PhoneType === "DEFAULT" || p.PhoneType === "MOBILE",
    );
    return phone?.PhoneNumber || undefined;
  }

  private formatAddress(contact: XeroContact): string | undefined {
    const address = contact.Addresses?.find(
      (a) => a.AddressType === "POBOX" || a.AddressType === "STREET",
    );
    if (!address) return undefined;

    const parts = [
      address.AddressLine1,
      address.AddressLine2,
      address.City,
      address.Region,
      address.PostalCode,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(", ") : undefined;
  }

  private mapInvoiceStatus(status: string): string {
    const statusMap: Record<string, string> = {
      DRAFT: "DRAFT",
      SUBMITTED: "PENDING",
      AUTHORISED: "ACTIVE",
      PAID: "COMPLETED",
      VOIDED: "CANCELLED",
    };
    return statusMap[status] || status;
  }
}

export async function createXeroClient(
  integrationId: string,
): Promise<XeroClient> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  });

  if (!integration || integration.provider !== "XERO") {
    throw new Error("Invalid Xero integration");
  }

  return new XeroClient(integrationId, integration.tenantId || undefined);
}
