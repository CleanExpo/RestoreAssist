/**
 * Zoho CRM client.
 *
 * OAuth is region-aware (accounts.zoho.*). CRM calls go to the api_domain
 * Zoho returned at token exchange, and only when that host is on the
 * published allowlist. Record parsing follows the v6 `{ data, info }`
 * envelope. That shape is the published contract, not a live-tenant capture,
 * so a body that is not a record list is logged by key name and counted as
 * a failed module rather than a silent zero.
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
  disconnectIntegration,
  getTokens,
  markIntegrationError,
  storeTokens,
} from "../oauth-handler";
import { prisma } from "@/lib/prisma";
import { isOAuthIntegration } from "../identity";
import { DEFAULT_RETRY_OPTIONS, retryWithExponentialBackoff } from "../retry";
import { withRateLimit } from "../rate-limiter";
import {
  accountsServerForRegion,
  allowApiDomain,
  apiDomainForRegion,
  resolveZohoRegion,
  type ZohoConnectRegion,
  type ZohoRegion,
} from "./regions";
import { redactSecrets } from "./redact";
import {
  ZOHO_MODULE_FIELDS,
  mapZohoAccount,
  mapZohoContact,
  mapZohoDeal,
  mapZohoLead,
  readZohoPage,
  zohoHistoricalExternalId,
  zohoRecordId,
  type ZohoModule,
} from "./map";

const MAX_PAGES = 25;
const PER_PAGE = 200;

function httpFailure(message: string, status: number): Error {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

interface ZohoBinding {
  region: ZohoRegion;
  apiDomain: string;
  userId: string;
}

export class ZohoClient extends BaseIntegrationClient {
  constructor(integrationId: string) {
    super(integrationId, "ZOHO");
  }

  getAuthUrl(redirectUri: string, state: string, region: ZohoConnectRegion = "AU"): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: getClientId("ZOHO"),
      redirect_uri: redirectUri,
      scope: this.config.scopes.join(","),
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `${accountsServerForRegion(region)}/oauth/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenResponse> {
    await assertOAuthIntegration(this.integrationId, this.provider);
    const binding = await this.binding();
    const response = await fetch(`${accountsServerForRegion(binding.region)}/oauth/v2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: getClientId("ZOHO"),
        client_secret: getClientSecret("ZOHO"),
        redirect_uri: redirectUri,
        code,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const parsed = await this.readTokenResponse(response, "exchange");
    await storeTokens(
      this.integrationId,
      parsed.access_token,
      parsed.refresh_token,
      parsed.expires_in,
      this.provider,
    );
    await prisma.integration.update({
      where: { id: this.integrationId },
      data: {
        tenantId: allowApiDomain(parsed.api_domain) ?? apiDomainForRegion(binding.region),
        companyId: binding.region,
        status: "CONNECTED",
        syncError: null,
      },
    });
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_in: parsed.expires_in,
      token_type: parsed.token_type,
    };
  }

  async refreshAccessToken(): Promise<void> {
    const tokens = await getTokens(this.integrationId, this.provider);
    if (!tokens.refreshToken) {
      throw new Error("No refresh token available");
    }
    const binding = await this.binding();
    const response = await fetch(`${accountsServerForRegion(binding.region)}/oauth/v2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: getClientId("ZOHO"),
        client_secret: getClientSecret("ZOHO"),
        refresh_token: tokens.refreshToken,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const parsed = await this.readTokenResponse(response, "refresh");
    await storeTokens(
      this.integrationId,
      parsed.access_token,
      parsed.refresh_token || tokens.refreshToken,
      parsed.expires_in,
      this.provider,
    );
    const apiDomain = allowApiDomain(parsed.api_domain);
    if (apiDomain) {
      await prisma.integration.update({
        where: { id: this.integrationId },
        data: { tenantId: apiDomain },
      });
    }
  }

  async fetchClients(): Promise<ExternalClientData[]> {
    await assertOAuthIntegration(this.integrationId, this.provider);
    const contacts = await this.listModule("Contacts");
    const accounts = await this.listModule("Accounts");
    const mapped = [
      ...contacts.flatMap((row) => {
        const client = mapZohoContact(row);
        return client ? [client] : [];
      }),
      ...accounts.flatMap((row) => {
        const client = mapZohoAccount(row);
        return client ? [client] : [];
      }),
    ];
    return mapped;
  }

  async fetchJobs(): Promise<ExternalJobData[]> {
    await assertOAuthIntegration(this.integrationId, this.provider);
    const deals = await this.listModule("Deals");
    const leads = await this.listModule("Leads");
    return [
      ...deals.flatMap((row) => {
        const job = mapZohoDeal(row);
        return job ? [job] : [];
      }),
      ...leads.flatMap((row) => {
        const job = mapZohoLead(row);
        return job ? [job] : [];
      }),
    ];
  }

  /**
   * Pull contacts and accounts into ExternalClient, and into Client when the
   * row has an email. Re-runs upsert the same external id and the same
   * (user, email) client.
   */
  async syncClients(): Promise<number> {
    await assertOAuthIntegration(this.integrationId, this.provider);
    const binding = await this.binding();
    const clients = await this.fetchClients();
    let processed = 0;
    for (const client of clients) {
      const contactId = await this.mirrorCustomer(binding.userId, client);
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
          contactId,
          rawData: (client.rawData || {}) as object,
        },
        update: {
          name: client.name,
          email: client.email,
          phone: client.phone,
          address: client.address,
          contactId,
          rawData: (client.rawData || {}) as object,
          lastSyncedAt: new Date(),
        },
      });
      processed++;
    }
    await this.logSyncResult("CLIENTS", processed);
    return processed;
  }

  /**
   * Pull deals and leads into ExternalJob and HistoricalJob (source `zoho`).
   * The historical id includes the integration id so two organisations cannot
   * collide on Zoho's record id.
   */
  async syncJobs(): Promise<number> {
    await assertOAuthIntegration(this.integrationId, this.provider);
    const binding = await this.binding();
    const jobs = await this.fetchJobs();
    let processed = 0;
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
          rawData: (job.rawData || {}) as object,
        },
        update: {
          title: job.title,
          status: job.status,
          clientExternalId: job.clientExternalId,
          address: job.address,
          description: job.description,
          rawData: (job.rawData || {}) as object,
          lastSyncedAt: new Date(),
        },
      });
      await this.mirrorHistorical(binding.userId, job);
      const leadEmail = typeof job.rawData?.Email === "string" ? job.rawData.Email : undefined;
      if (job.externalId.startsWith("lead:") && leadEmail) {
        await this.mirrorCustomer(binding.userId, {
          externalId: job.externalId,
          name: job.title,
          email: leadEmail,
          rawData: job.rawData,
        });
      }
      processed++;
    }
    await this.logSyncResult("JOBS", processed);
    return processed;
  }

  async upsertRecord(
    module: "Contacts" | "Accounts" | "Deals",
    body: { data: Record<string, unknown>[]; duplicate_check_fields: string[] },
  ): Promise<string> {
    const response = await this.crmRequest(`/${module}/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const id = zohoRecordId(response);
    if (!id) {
      const page = readZohoPage(response);
      throw new Error(`Zoho ${module} upsert failed${page.errorCode ? `: ${page.errorCode}` : ""}`);
    }
    return id;
  }

  private async mirrorCustomer(
    userId: string,
    client: ExternalClientData,
  ): Promise<string | null> {
    const email = client.email?.trim().toLowerCase();
    if (!email) return null;
    const company = typeof client.rawData?.Account_Name === "string"
      ? client.rawData.Account_Name
      : client.rawData && typeof client.rawData.Account_Name === "object" && client.rawData.Account_Name && typeof (client.rawData.Account_Name as { name?: unknown }).name === "string"
        ? (client.rawData.Account_Name as { name: string }).name
        : undefined;
    const existing = await prisma.client.findFirst({
      where: { userId, email },
      select: { id: true },
    });
    if (existing) {
      await prisma.client.update({
        where: { id: existing.id },
        data: {
          name: client.name,
          phone: client.phone,
          address: client.address,
          ...(company ? { company } : {}),
        },
      });
      return existing.id;
    }
    const created = await prisma.client.create({
      data: {
        userId,
        email,
        name: client.name,
        phone: client.phone,
        address: client.address,
        company,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async mirrorHistorical(userId: string, job: ExternalJobData): Promise<void> {
    const module = job.externalId.startsWith("lead:") ? "Leads" : "Deals";
    const zohoId = job.externalId.slice(job.externalId.indexOf(":") + 1);
    const raw = job.rawData ?? {};
    const suburb = typeof raw.City === "string" && raw.City.trim() ? raw.City.trim() : "Unknown";
    const state = typeof raw.State === "string" && raw.State.trim() ? raw.State.trim() : "Unknown";
    const postcode = typeof raw.Zip_Code === "string" && raw.Zip_Code.trim() ? raw.Zip_Code.trim() : "0000";
    const customerName = typeof raw.Company === "string"
      ? raw.Company
      : typeof raw.Full_Name === "string"
        ? raw.Full_Name
        : undefined;
    const externalId = zohoHistoricalExternalId(this.integrationId, module, zohoId);
    const data = {
      jobNumber: zohoId.slice(0, 64),
      jobName: job.title.slice(0, 200),
      description: job.description || job.title,
      claimType: "GENERAL",
      address: job.address,
      suburb,
      state,
      postcode,
      customerName,
    };
    await prisma.historicalJob.upsert({
      where: { source_externalId: { source: "zoho", externalId } },
      create: { tenantId: userId, source: "zoho", externalId, ...data },
      update: data,
    });
  }

  private async listModule(module: ZohoModule): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const fields = encodeURIComponent(ZOHO_MODULE_FIELDS[module]);
      const body = await this.crmRequest(
        `/${module}?fields=${fields}&per_page=${PER_PAGE}&page=${page}`,
      );
      const parsed = readZohoPage(body);
      if (parsed.errorCode) {
        throw new Error(`Zoho ${module} list failed: ${parsed.errorCode}`);
      }
      if (parsed.rows.length === 0 && parsed.emptyShape && parsed.emptyShape.some((key) => key !== "info")) {
        console.warn("[zoho] list returned no rows", { module, keys: parsed.emptyShape });
      }
      rows.push(...parsed.rows);
      if (!parsed.more) break;
    }
    return rows;
  }

  private async crmRequest(path: string, init: RequestInit = {}): Promise<unknown> {
    return withRateLimit("ZOHO", () =>
      retryWithExponentialBackoff(async () => {
        const tokens = await getTokens(this.integrationId, this.provider);
        if (!tokens.accessToken) throw new Error("No access token available");
        const fresh = await this.ensureFreshToken(tokens);
        const binding = await this.binding();
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Zoho-oauthtoken ${fresh}`);
        headers.set("Accept", "application/json");
        const response = await fetch(`${binding.apiDomain}/crm/v6${path}`, {
          ...init,
          headers,
          signal: AbortSignal.timeout(15000),
        });
        if (response.status === 204) return null;
        const raw = await response.text();
        if (!response.ok) {
          const safe = redactSecrets(raw).slice(0, 300);
          await markIntegrationError(
            this.integrationId,
            `Zoho API ${response.status}${safe ? `: ${safe}` : ""}`,
            this.provider,
          );
          throw httpFailure(`Zoho API request failed: ${response.status}`, response.status);
        }
        if (!raw) return null;
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          throw new Error("Zoho API returned a non-JSON body");
        }
      }, DEFAULT_RETRY_OPTIONS),
    );
  }

  private async ensureFreshToken(tokens: {
    accessToken: string | null;
    refreshToken: string | null;
    tokenExpiresAt: Date | null;
    isExpired: boolean;
  }): Promise<string> {
    const fiveMinutes = 5 * 60 * 1000;
    const needsRefresh =
      tokens.isExpired ||
      (tokens.tokenExpiresAt != null && tokens.tokenExpiresAt.getTime() - Date.now() < fiveMinutes);
    if (!needsRefresh) return tokens.accessToken || "";
    if (!tokens.refreshToken) throw new Error("No refresh token available");
    await this.refreshAccessToken();
    const next = await getTokens(this.integrationId, this.provider);
    if (!next.accessToken) throw new Error("Failed to refresh access token");
    return next.accessToken;
  }

  private async binding(): Promise<ZohoBinding> {
    const integration = await prisma.integration.findUnique({
      where: { id: this.integrationId },
      select: {
        userId: true,
        tenantId: true,
        companyId: true,
        provider: true,
        name: true,
        icon: true,
        config: true,
        realmId: true,
        tokenExpiresAt: true,
      },
    });
    if (!integration || !isOAuthIntegration(integration, "ZOHO")) {
      throw new Error("Invalid Zoho integration");
    }
    const region = resolveZohoRegion({
      apiDomain: integration.tenantId,
      companyId: integration.companyId,
    });
    return {
      region,
      apiDomain: allowApiDomain(integration.tenantId) ?? apiDomainForRegion(region),
      userId: integration.userId,
    };
  }

  private async readTokenResponse(
    response: Response,
    stage: "exchange" | "refresh",
  ): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    api_domain?: string;
  }> {
    const raw = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      const json = raw ? JSON.parse(raw) : {};
      if (json && typeof json === "object") parsed = json as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    const errorCode = typeof parsed.error === "string" ? parsed.error : "";
    const failed = !response.ok || Boolean(errorCode) || typeof parsed.access_token !== "string";
    if (failed) {
      const terminal =
        response.status === 401 ||
        response.status === 403 ||
        /invalid_grant|invalid_code|invalid_client/i.test(errorCode || raw);
      if (stage === "refresh" && terminal) {
        await disconnectIntegration(this.integrationId, this.provider);
      } else {
        await markIntegrationError(
          this.integrationId,
          `Zoho token ${stage} failed`,
          this.provider,
        );
      }
      throw httpFailure(
        terminal && stage === "refresh"
          ? "Zoho token refresh was rejected"
          : `Zoho token ${stage} failed`,
        terminal ? 400 : response.status || 500,
      );
    }
    return {
      access_token: parsed.access_token as string,
      refresh_token: typeof parsed.refresh_token === "string" ? parsed.refresh_token : undefined,
      expires_in: typeof parsed.expires_in === "number" ? parsed.expires_in : undefined,
      token_type: typeof parsed.token_type === "string" ? parsed.token_type : undefined,
      api_domain: typeof parsed.api_domain === "string" ? parsed.api_domain : undefined,
    };
  }
}

export async function createZohoClient(integrationId: string): Promise<ZohoClient> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: {
      provider: true,
      name: true,
      icon: true,
      config: true,
      tenantId: true,
      realmId: true,
      companyId: true,
      tokenExpiresAt: true,
    },
  });
  if (!integration || !isOAuthIntegration(integration, "ZOHO")) {
    throw new Error("Invalid Zoho integration");
  }
  return new ZohoClient(integrationId);
}
