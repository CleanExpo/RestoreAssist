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
  assertOAuthIntegration,
} from "../oauth-handler";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/credential-vault";
import { readXeroBinding, readReadyXeroBinding, updateXeroBinding, type XeroBindingExpectation, type XeroBinding, sameXeroGrant } from "@/lib/services/xero/binding";
import { isOAuthIntegration } from "../identity";
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
  private binding: XeroBinding | null = null;

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
    const original = await readXeroBinding(this.integrationId);
    if (!original.ok) throw new Error(original.detail);
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
      throw new Error(`Xero token exchange failed (${response.status})`);
    }

    const tokenResponse: TokenResponse = await response.json();
    let tenantId: string;
    try {
      if (typeof tokenResponse.access_token !== "string" || !tokenResponse.access_token.trim()) {
        throw new Error("Xero token exchange returned invalid credentials");
      }
      tenantId = await this.discoverTenant(tokenResponse.access_token, original.data.tenantId);
    } catch (error) {
      // Failed/stale attempts must never change a newer completed connection.
      await updateXeroBinding(original.data, {
        tenantId: null, status: "ERROR",
        syncError: error instanceof Error ? error.message : "Xero organisation lookup failed",
      });
      throw error;
    }
    const committed = await updateXeroBinding(original.data, {
      accessToken: encrypt(tokenResponse.access_token),
      refreshToken: tokenResponse.refresh_token ? encrypt(tokenResponse.refresh_token) : null,
      tokenExpiresAt: tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
      tenantId, status: "CONNECTED", syncError: null,
    });
    if (!committed.ok) throw new Error(committed.detail);
    this.tenantId = tenantId;
    this.binding = committed.data;
    return tokenResponse;
  }

  /** Discover using only the in-memory grant that will be committed with it. */
  private async discoverTenant(accessToken: string, previousTenantId: string | null): Promise<string> {
    const response = await fetch("https://api.xero.com/connections", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(XERO_REQUEST_TIMEOUT_MS),
    }).catch(() => { throw new Error("Xero organisation lookup was interrupted. Try connecting again."); });
    if (!response.ok) {
      throw new Error(`Xero organisation lookup failed (${response.status}). Try connecting again.`);
    }
    const connections: unknown = await response.json().catch(() => {
      throw new Error("Xero organisation lookup returned an invalid connection list");
    });
    if (!Array.isArray(connections) || connections.some(connection =>
      !connection || typeof connection.tenantId !== "string" || !connection.tenantId.trim())) {
      throw new Error("Xero organisation lookup returned an invalid connection list");
    }
    const tenantIds = [...new Set((connections as XeroTenantConnection[]).map(connection => connection.tenantId))];
    const selected = previousTenantId
      ? tenantIds.includes(previousTenantId) ? previousTenantId : null
      : tenantIds.length === 1 ? tenantIds[0] : null;
    if (!selected) {
      throw new Error(previousTenantId
        ? "The previously connected Xero organisation is no longer authorised. Select the intended organisation before reconnecting."
        : tenantIds.length === 0
        ? "No Xero organisation is authorised for this connection. Connect Xero and select an organisation."
        : "Multiple Xero organisations are authorised. Connect Xero with one organisation or retain the existing authorised organisation.");
    }
    return selected;
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(expected: XeroBindingExpectation = {}): Promise<void> {
    if (this.tenantId && expected.expectedTenantId !== undefined && expected.expectedTenantId !== this.tenantId) {
      throw new Error("Xero connection binding changed; retry with the current connection");
    }
    const current = await readReadyXeroBinding(this.integrationId, { ...expected, ...(this.tenantId ? { expectedTenantId: this.tenantId } : {}) });
    if (!current.ok) throw new Error(current.detail);
    const { binding, refreshToken } = current.data;
    if (this.binding && !sameXeroGrant(this.binding, binding)) throw new Error("Xero connection binding changed during sync");
    if (!refreshToken) {
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
          refresh_token: refreshToken,
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
      const message = `Xero token refresh failed (${response.status}); ${isTerminal ? "reconnect required" : "try again"}`;
      await updateXeroBinding(binding, isTerminal ? {
        status: "DISCONNECTED", accessToken: null, refreshToken: null,
        tokenExpiresAt: null, tenantId: null, syncError: message,
      } : { status: "ERROR", syncError: message });
      throw new Error(message);
    }

    const tokenResponse: TokenResponse = await response.json();
    if (typeof tokenResponse.access_token !== "string" || !tokenResponse.access_token.trim()) {
      throw new Error("Xero refresh returned invalid credentials");
    }
    const committed = await updateXeroBinding(binding, {
      accessToken: encrypt(tokenResponse.access_token),
      refreshToken: encrypt(tokenResponse.refresh_token || refreshToken),
      tokenExpiresAt: tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
      status: "CONNECTED", syncError: null,
    });
    if (!committed.ok) throw new Error(committed.detail);
    this.binding = committed.data;
  }

  /**
   * Make Xero API request with tenant header
   */
  protected async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    let current = await readReadyXeroBinding(this.integrationId, this.tenantId ? { expectedTenantId: this.tenantId } : {});
    if (!current.ok) throw new Error(current.detail);
    const original = current.data.binding;
    if (this.binding && !sameXeroGrant(this.binding, original)) throw new Error("Xero connection binding changed during sync");
    this.binding = original;
    this.tenantId = current.data.tenantId;
    if (original.tokenExpiresAt && original.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
      await this.refreshAccessToken({ expectedUserId: original.userId, expectedWorkspaceId: original.workspaceId });
      current = await readReadyXeroBinding(this.integrationId, {
        expectedTenantId: this.tenantId, expectedUserId: original.userId,
        expectedWorkspaceId: original.workspaceId,
      });
      if (!current.ok) throw new Error(current.detail);
    }
    const { binding, accessToken, tenantId } = current.data;
    if (this.binding && !sameXeroGrant(this.binding, binding)) {
      throw new Error("Xero connection binding changed during sync");
    }
    this.binding = binding;

    const url = `${this.config.apiBaseUrl}${endpoint}`;
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("xero-tenant-id", tenantId);
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
      await updateXeroBinding(binding, { status: "ERROR", syncError: `Xero API request failed (${response.status})` });
      const apiErr = new Error(
        `Xero API request failed (${response.status})`,
      );
      (apiErr as { status?: number }).status = response.status;
      throw apiErr;
    }

    const payload = await response.json();
    await this.currentSyncBinding();
    return payload;
  }

  private async currentSyncBinding(): Promise<XeroBinding> {
    if (!this.binding) throw new Error("Xero sync has no validated binding");
    const current = await readXeroBinding(this.integrationId);
    if (!current.ok || !sameXeroGrant(this.binding, current.data) || !["CONNECTED", "SYNCING", "ERROR"].includes(current.data.status)) {
      throw new Error("Xero connection binding changed during sync");
    }
    return current.data;
  }

  protected async logSyncResult(syncType: "CLIENTS" | "JOBS" | "FULL", processed: number, failed = 0, error?: string): Promise<void> {
    // Rejected stale clients must not annotate a replacement connection.
    let current: XeroBinding;
    try { current = await this.currentSyncBinding(); } catch { return; }
    const logged = await updateXeroBinding(current, { lastSyncAt: new Date(), syncError: error || null });
    if (!logged.ok) return;
    this.binding = logged.data;
    await prisma.integrationSyncLog.create({ select: { id: true }, data: {
      integrationId: this.integrationId, syncType,
      status: error ? "FAILED" : failed > 0 ? "PARTIAL" : "SUCCESS",
      recordsProcessed: processed, recordsFailed: failed, errorMessage: error, completedAt: new Date(),
    } });
  }

  /** Own the lifecycle so only this run's grant can receive terminal status. */
  async syncWithLifecycle(options: { syncClients: boolean; syncJobs: boolean }, expected: XeroBindingExpectation) {
    const ready = await readReadyXeroBinding(this.integrationId, expected);
    if (!ready.ok) throw new Error(ready.detail);
    const started = await updateXeroBinding(ready.data.binding, { status: "SYNCING", syncError: null });
    if (!started.ok) throw new Error(started.detail);
    this.binding = started.data;
    this.tenantId = started.data.tenantId;
    try {
      const clientsCount = options.syncClients ? await this.syncClients() : 0;
      const jobsCount = options.syncJobs ? await this.syncJobs() : 0;
      const finished = await updateXeroBinding(await this.currentSyncBinding(), { status: "CONNECTED", syncError: null, lastSyncAt: new Date() });
      if (!finished.ok) throw new Error(finished.detail);
      this.binding = finished.data;
      return { clientsCount, jobsCount };
    } catch (error) {
      try {
        await updateXeroBinding(await this.currentSyncBinding(), { status: "ERROR", syncError: "Xero sync failed; retry or reconnect" });
      } catch { /* The replacement connection belongs to another operation. */ }
      throw error;
    }
  }

  /**
   * Fetch contacts from Xero (paginated, summaryOnly — Ascora-style page budget).
   *
   * Do NOT send `where=IsCustomer==true`: high-volume orgs reject Contact
   * where-filters with HighVolumeFilterUnavailableApiException (9191919).
   * Paginate unfiltered and keep customers client-side.
   */
  async fetchClients(): Promise<ExternalClientData[]> {
    await assertOAuthIntegration(this.integrationId, this.provider);
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

        if (!response || !Array.isArray(response.Contacts)) {
          throw new Error("Invalid Xero contacts response: Contacts must be an array");
        }
        const contacts = response.Contacts;
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
    await assertOAuthIntegration(this.integrationId, this.provider);
    try {
      const allJobs: ExternalJobData[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.makeRequest<XeroInvoicesResponse>(
          `/Invoices?summaryOnly=true&page=${page}&pageSize=${XERO_PAGE_SIZE}`,
        );

        if (!response || !Array.isArray(response.Invoices)) {
          throw new Error("Invalid Xero invoices response: Invoices must be an array");
        }
        const invoices = response.Invoices;
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

    for (let offset = 0; offset < clients.length; offset += 100) {
      const original = await this.currentSyncBinding();
      await prisma.$transaction(async tx => {
        const claimed = await updateXeroBinding(original, {}, tx);
        if (!claimed.ok) throw new Error(claimed.detail);
        for (const client of clients.slice(offset, offset + 100)) {
          await tx.externalClient.upsert({
            select: { id: true },
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
        this.binding = claimed.data;
      }, { timeout: 15_000 });
    }

    return synced;
  }

  /**
   * Sync jobs (invoices) to database
   */
  async syncJobs(): Promise<number> {
    const jobs = await this.fetchJobs();
    let synced = 0;

    for (let offset = 0; offset < jobs.length; offset += 100) {
      const original = await this.currentSyncBinding();
      await prisma.$transaction(async tx => {
        const claimed = await updateXeroBinding(original, {}, tx);
        if (!claimed.ok) throw new Error(claimed.detail);
        for (const job of jobs.slice(offset, offset + 100)) {
          await tx.externalJob.upsert({
            select: { id: true },
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
        this.binding = claimed.data;
      }, { timeout: 15_000 });
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
    select: { provider: true, name: true, icon: true, config: true, tenantId: true, realmId: true, companyId: true, tokenExpiresAt: true },
  });

  if (!integration || !isOAuthIntegration(integration, "XERO")) {
    throw new Error("Invalid Xero integration");
  }

  return new XeroClient(integrationId, integration.tenantId || undefined);
}
