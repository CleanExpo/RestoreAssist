/**
 * RA-2966: ScrapingProviderConnection Service Layer
 *
 * Parallel to lib/workspace/provider-connections.ts (AI BYOK, RA-414).
 * Manages workspace-scoped scraping provider credentials (Apify, Bright Data,
 * Zyte, Firecrawl) used by /api/properties/scrape when a workspace opts out
 * of the SHARED Vercel-direct scrape path.
 *
 * SECURITY:
 *   - Plaintext keys are NEVER stored — only AES-256-GCM encrypted blobs
 *   - Plaintext keys NEVER returned from this module — only masked versions
 *   - Decrypted keys flow only to the server-side scrape dispatcher
 */

import { prisma } from "../prisma";
import { encrypt, decrypt } from "../credential-vault";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Mirrors the Prisma ScrapingProvider enum */
export type ScrapingProvider =
  | "APIFY"
  | "BRIGHTDATA"
  | "ZYTE"
  | "FIRECRAWL"
  | "SHARED";

/** Mirrors the Prisma ProviderConnectionStatus enum (reused — shared with AI BYOK) */
export type ScrapingProviderStatus = "ACTIVE" | "DISABLED" | "FAILED";

/** Shape stored (encrypted) in encryptedCredentials */
interface CredentialPayload {
  apiKey: string;
}

/** Optional shape stored (encrypted) in encryptedConfig — provider-specific tuning */
interface ConfigPayload {
  /** Apify actor IDs for AU listings, keyed by host */
  apifyActorsByHost?: Record<string, string>;
  /** Per-host rate-limit overrides (req/min) */
  rateLimitByHost?: Record<string, number>;
}

/** Safe public representation — no plaintext key */
export interface ScrapingProviderConnectionSummary {
  id: string;
  workspaceId: string;
  provider: ScrapingProvider;
  status: ScrapingProviderStatus;
  maskedKey: string;
  hasConfig: boolean;
  lastValidatedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertScrapingProviderConnectionInput {
  workspaceId: string;
  provider: ScrapingProvider;
  /** Plaintext API key — encrypted before persistence. Pass empty string for SHARED. */
  plaintextApiKey: string;
  /** Optional provider-specific config (encrypted at rest) */
  config?: ConfigPayload;
  /** WorkspaceMember.id of the member saving the key */
  memberId?: string;
}

export interface ValidateScrapingProviderResult {
  provider: ScrapingProvider;
  valid: boolean;
  errorMessage?: string;
  latencyMs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function maskApiKey(key: string): string {
  if (!key || key.length === 0) return "(empty)";
  if (key.length <= 14) return "•".repeat(key.length);
  const prefix = key.slice(0, 10);
  const suffix = key.slice(-4);
  return `${prefix}${"•".repeat(Math.max(12, key.length - 14))}${suffix}`;
}

function encryptCredentials(payload: CredentialPayload): string {
  return encrypt(JSON.stringify(payload));
}

function decryptCredentials(encrypted: string): CredentialPayload {
  return JSON.parse(decrypt(encrypted)) as CredentialPayload;
}

function encryptConfig(payload: ConfigPayload): string {
  return encrypt(JSON.stringify(payload));
}

function decryptConfig(encrypted: string): ConfigPayload {
  return JSON.parse(decrypt(encrypted)) as ConfigPayload;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSummary(row: any): ScrapingProviderConnectionSummary {
  let maskedKey = "•••••••••••••••••••";
  try {
    if (row.encryptedCredentials) {
      const payload = decryptCredentials(row.encryptedCredentials);
      maskedKey = maskApiKey(payload.apiKey);
    }
  } catch {
    // Decryption failed — fall through with generic mask
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider as ScrapingProvider,
    status: row.status as ScrapingProviderStatus,
    maskedKey,
    hasConfig: Boolean(row.encryptedConfig),
    lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
    lastError: row.lastError ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function listScrapingProviderConnections(
  workspaceId: string,
): Promise<ScrapingProviderConnectionSummary[]> {
  const rows = await prisma.scrapingProviderConnection.findMany({
    where: { workspaceId },
    select: {
      id: true,
      workspaceId: true,
      provider: true,
      status: true,
      encryptedCredentials: true,
      encryptedConfig: true,
      lastValidatedAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { provider: "asc" },
    take: 50,
  });
  return rows.map(toSummary);
}

/**
 * Get the decrypted API key + config for the active scraping provider in a workspace.
 * Returns null if no ACTIVE connection exists.
 *
 * IMPORTANT: The returned key must NEVER be sent to the client.
 * Only callable from server-side scrape dispatch.
 */
export async function getActiveScrapingProvider(
  workspaceId: string,
): Promise<{
  provider: ScrapingProvider;
  apiKey: string;
  config: ConfigPayload | null;
} | null> {
  const row = await prisma.scrapingProviderConnection.findFirst({
    where: { workspaceId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    select: {
      provider: true,
      encryptedCredentials: true,
      encryptedConfig: true,
    },
  });

  if (!row || !row.encryptedCredentials) return null;

  try {
    const payload = decryptCredentials(row.encryptedCredentials);
    const apiKey = payload.apiKey?.trim();
    if (!apiKey && row.provider !== "SHARED") return null;
    return {
      provider: row.provider as ScrapingProvider,
      apiKey: apiKey ?? "",
      config: row.encryptedConfig
        ? decryptConfig(row.encryptedConfig)
        : null,
    };
  } catch (err) {
    console.error(
      `[getActiveScrapingProvider] Decryption failed for workspace ${workspaceId}:`,
      err,
    );
    return null;
  }
}

/**
 * Upsert a scraping provider connection — encrypt the plaintext key and persist.
 * SHARED provider may be saved with an empty key (it doesn't need one).
 */
export async function upsertScrapingProviderConnection(
  input: UpsertScrapingProviderConnectionInput,
): Promise<ScrapingProviderConnectionSummary> {
  const { workspaceId, provider, plaintextApiKey, config, memberId } = input;

  if (provider !== "SHARED" && !plaintextApiKey?.trim()) {
    throw new Error(
      `API key must not be empty for provider ${provider} (SHARED is the only key-less option)`,
    );
  }

  const encryptedCreds = encryptCredentials({
    apiKey: (plaintextApiKey ?? "").trim(),
  });
  const encryptedCfg = config ? encryptConfig(config) : null;

  const row = await prisma.scrapingProviderConnection.upsert({
    where: { workspaceId_provider: { workspaceId, provider } },
    create: {
      workspaceId,
      provider,
      status: "ACTIVE",
      encryptedCredentials: encryptedCreds,
      encryptedConfig: encryptedCfg,
      createdByMemberId: memberId ?? null,
    },
    update: {
      status: "ACTIVE",
      encryptedCredentials: encryptedCreds,
      encryptedConfig: encryptedCfg,
      lastError: null,
      lastValidatedAt: null,
    },
  });

  return toSummary(row);
}

export async function disableScrapingProviderConnection(
  workspaceId: string,
  provider: ScrapingProvider,
): Promise<void> {
  await prisma.scrapingProviderConnection.updateMany({
    where: { workspaceId, provider },
    data: { status: "DISABLED" },
  });
}

/**
 * Validate a scraping provider API key by making a minimal test call.
 */
export async function validateScrapingProviderKey(
  workspaceId: string,
  provider: ScrapingProvider,
): Promise<ValidateScrapingProviderResult> {
  const start = Date.now();

  if (provider === "SHARED") {
    // SHARED has no external auth — always valid
    await prisma.scrapingProviderConnection.updateMany({
      where: { workspaceId, provider },
      data: {
        status: "ACTIVE",
        lastValidatedAt: new Date(),
        lastError: null,
      },
    });
    return { provider, valid: true, latencyMs: Date.now() - start };
  }

  const active = await getActiveScrapingProvider(workspaceId);
  if (!active || active.provider !== provider) {
    return {
      provider,
      valid: false,
      errorMessage: "No active API key configured for this provider",
      latencyMs: Date.now() - start,
    };
  }

  let valid = false;
  let errorMessage: string | undefined;

  try {
    await testScrapingProviderKey(provider, active.apiKey);
    valid = true;
  } catch (err) {
    errorMessage =
      err instanceof Error ? err.message : "Validation failed — unknown error";
  }

  const latencyMs = Date.now() - start;

  await prisma.scrapingProviderConnection.updateMany({
    where: { workspaceId, provider },
    data: valid
      ? { status: "ACTIVE", lastValidatedAt: new Date(), lastError: null }
      : {
          status: "FAILED",
          lastError: errorMessage ?? "Validation failed",
          lastValidatedAt: new Date(),
        },
  });

  return { provider, valid, errorMessage, latencyMs };
}

// ─── Provider Test Calls ─────────────────────────────────────────────────────

async function testScrapingProviderKey(
  provider: ScrapingProvider,
  apiKey: string,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    switch (provider) {
      case "APIFY":
        await testApifyKey(apiKey, controller.signal);
        break;
      case "BRIGHTDATA":
        await testBrightDataKey(apiKey, controller.signal);
        break;
      case "ZYTE":
        await testZyteKey(apiKey, controller.signal);
        break;
      case "FIRECRAWL":
        await testFirecrawlKey(apiKey, controller.signal);
        break;
      case "SHARED":
        return; // no-op — already handled in validateScrapingProviderKey
      default:
        throw new Error(`Unknown scraping provider: ${provider}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function testApifyKey(apiKey: string, signal: AbortSignal): Promise<void> {
  // GET /v2/users/me — cheap, auth-only, no actor run
  const res = await fetch("https://api.apify.com/v2/users/me", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Apify auth failed: HTTP ${res.status}`);
  }
}

async function testBrightDataKey(apiKey: string, signal: AbortSignal): Promise<void> {
  // GET /api/zone — auth-only
  const res = await fetch("https://api.brightdata.com/zone", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok && res.status !== 404) {
    // 404 is OK — means auth worked, just no zones yet
    throw new Error(`Bright Data auth failed: HTTP ${res.status}`);
  }
}

async function testZyteKey(apiKey: string, signal: AbortSignal): Promise<void> {
  // Zyte API uses Basic auth with key as username, empty password
  const res = await fetch("https://api.zyte.com/v1/extract", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: "https://httpbin.org/get", httpResponseBody: false }),
    signal,
  });
  // 200 or 422 (bad request shape but auth worked) both mean key is valid
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Zyte auth failed: HTTP ${res.status}`);
  }
}

async function testFirecrawlKey(apiKey: string, signal: AbortSignal): Promise<void> {
  const res = await fetch("https://api.firecrawl.dev/v1/account", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Firecrawl auth failed: HTTP ${res.status}`);
  }
}
