/**
 * RA-414: ProviderConnection Service Layer
 *
 * Manages workspace AI provider connections — stores encrypted BYOK API keys
 * in the ProviderConnection table and provides a clean interface for:
 *   - Upserting (saving) provider keys, AES-256-GCM encrypted at rest
 *   - Resolving (decrypting) keys for dispatch use
 *   - Validating keys by test-calling each provider
 *   - Listing masked connections for the settings UI
 *   - Resolving the active workspace for a given user
 *
 * SECURITY RULES:
 *   - Plaintext API keys are NEVER stored — only encrypted blobs
 *   - Plaintext keys are NEVER returned from this module — only masked versions
 *   - Decrypted keys flow only to the BYOK dispatch layer (never to API responses)
 */

import { prisma } from "../prisma";
import { encrypt, decrypt } from "../credential-vault";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Mirrors the Prisma AiProvider enum */
export type AiProvider = "ANTHROPIC" | "OPENAI" | "GOOGLE" | "GEMMA";

/** Mirrors the Prisma ProviderConnectionStatus enum */
export type ProviderConnectionStatus = "ACTIVE" | "DISABLED" | "ERROR";

/** Shape stored (encrypted) in encryptedCredentials */
interface CredentialPayload {
  apiKey: string;
}

/** Safe public representation — no plaintext key exposed */
export interface ProviderConnectionSummary {
  id: string;
  workspaceId: string;
  provider: AiProvider;
  status: ProviderConnectionStatus;
  maskedKey: string; // e.g. "sk-ant-...•••••••••••••••••••••••••••••••••1234"
  lastValidatedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertProviderConnectionInput {
  workspaceId: string;
  provider: AiProvider;
  /** Plaintext API key — encrypted before persistence */
  plaintextApiKey: string;
  /** Optional WorkspaceMember.id of the member saving the key */
  memberId?: string;
}

export interface ValidateProviderResult {
  provider: AiProvider;
  valid: boolean;
  errorMessage?: string;
  latencyMs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Mask a plaintext API key for safe display (first 10 + dots + last 4). */
function maskApiKey(key: string): string {
  if (key.length <= 14) return "•".repeat(key.length);
  const prefix = key.slice(0, 10);
  const suffix = key.slice(-4);
  return `${prefix}${"•".repeat(Math.max(12, key.length - 14))}${suffix}`;
}

/** Encrypt a CredentialPayload to the string stored in the DB. */
function encryptCredentials(payload: CredentialPayload): string {
  return encrypt(JSON.stringify(payload));
}

/** Decrypt and parse the stored credentials blob. */
function decryptCredentials(encrypted: string): CredentialPayload {
  const json = decrypt(encrypted);
  return JSON.parse(json) as CredentialPayload;
}

/** Map a Prisma ProviderConnection row to the safe summary shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSummary(row: any): ProviderConnectionSummary {
  let maskedKey = "•••••••••••••••••••";
  try {
    if (row.encryptedCredentials) {
      const payload = decryptCredentials(row.encryptedCredentials);
      maskedKey = maskApiKey(payload.apiKey);
    }
  } catch {
    // Decryption failed (e.g. empty placeholder) — show generic mask
  }

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider as AiProvider,
    status: row.status as ProviderConnectionStatus,
    maskedKey,
    lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
    lastError: row.lastError ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Find the first READY workspace owned by or containing the given userId.
 * Returns null if the user has no workspace.
 */
export async function getWorkspaceForUser(
  userId: string,
): Promise<{ id: string; name: string } | null> {
  // Prefer the workspace the user owns
  const owned = await prisma.workspace.findFirst({
    where: { ownerId: userId, status: "READY" },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (owned) return owned;

  // Fall back to any workspace they're an active member of
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, status: "ACTIVE" },
    select: { workspace: { select: { id: true, name: true, status: true } } },
    orderBy: { joinedAt: "asc" },
  });
  if (membership?.workspace?.status === "READY") {
    return {
      id: membership.workspace.id,
      name: membership.workspace.name,
    };
  }

  return null;
}

/**
 * List all provider connections for a workspace (safe, masked keys).
 */
export async function listProviderConnections(
  workspaceId: string,
): Promise<ProviderConnectionSummary[]> {
  const rows = await prisma.providerConnection.findMany({
    where: { workspaceId },
    orderBy: { provider: "asc" },
  });
  return rows.map(toSummary);
}

/**
 * Get the decrypted API key for a given provider in a workspace.
 * Returns null if no ACTIVE connection exists or if the key is empty.
 *
 * IMPORTANT: The returned key must NEVER be sent to the client.
 * It should only be passed to byokDispatch / workspaceByokDispatch.
 */
export async function getProviderApiKey(
  workspaceId: string,
  provider: AiProvider,
): Promise<string | null> {
  const row = await prisma.providerConnection.findUnique({
    where: { workspaceId_provider: { workspaceId, provider } },
    select: { status: true, encryptedCredentials: true },
  });

  if (!row || row.status !== "ACTIVE" || !row.encryptedCredentials) {
    return null;
  }

  try {
    const payload = decryptCredentials(row.encryptedCredentials);
    return payload.apiKey?.trim() || null;
  } catch (err) {
    console.error(
      `[getProviderApiKey] Decryption failed for workspace ${workspaceId} / ${provider}:`,
      err,
    );
    return null;
  }
}

/**
 * Upsert a provider connection — encrypt the plaintext key and persist.
 * Creates the row if it doesn't exist; updates it if it does.
 * Sets status to ACTIVE on successful save.
 */
export async function upsertProviderConnection(
  input: UpsertProviderConnectionInput,
): Promise<ProviderConnectionSummary> {
  const { workspaceId, provider, plaintextApiKey, memberId } = input;

  if (!plaintextApiKey?.trim()) {
    throw new Error("API key must not be empty");
  }

  const encrypted = encryptCredentials({ apiKey: plaintextApiKey.trim() });

  const row = await prisma.providerConnection.upsert({
    where: { workspaceId_provider: { workspaceId, provider } },
    create: {
      workspaceId,
      provider,
      status: "ACTIVE",
      encryptedCredentials: encrypted,
      createdByMemberId: memberId ?? null,
    },
    update: {
      status: "ACTIVE",
      encryptedCredentials: encrypted,
      lastError: null,
      lastValidatedAt: null,
    },
  });

  return toSummary(row);
}

/**
 * Mark a provider connection as disabled (without deleting it).
 */
export async function disableProviderConnection(
  workspaceId: string,
  provider: AiProvider,
): Promise<void> {
  await prisma.providerConnection.updateMany({
    where: { workspaceId, provider },
    data: { status: "DISABLED" },
  });
}

/**
 * Validate a provider API key by making a minimal test call.
 * Updates lastValidatedAt on success, lastError on failure.
 * Sets status to ACTIVE on success, ERROR on failure.
 */
export async function validateProviderKey(
  workspaceId: string,
  provider: AiProvider,
): Promise<ValidateProviderResult> {
  const start = Date.now();

  const apiKey = await getProviderApiKey(workspaceId, provider);
  if (!apiKey) {
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
    await testProviderKey(provider, apiKey);
    valid = true;
  } catch (err) {
    errorMessage =
      err instanceof Error ? err.message : "Validation failed — unknown error";
  }

  const latencyMs = Date.now() - start;

  // Persist validation result
  await prisma.providerConnection.updateMany({
    where: { workspaceId, provider },
    data: valid
      ? { status: "ACTIVE", lastValidatedAt: new Date(), lastError: null }
      : {
          status: "ERROR",
          lastError: errorMessage ?? "Validation failed",
          lastValidatedAt: new Date(),
        },
  });

  return { provider, valid, errorMessage, latencyMs };
}

// ─── Provider Test Calls ─────────────────────────────────────────────────────

/**
 * Minimal test call to verify a provider API key is valid.
 * Uses the cheapest/fastest available model for each provider.
 * Throws on auth failure or other errors.
 */
async function testProviderKey(
  provider: AiProvider,
  apiKey: string,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    switch (provider) {
      case "ANTHROPIC":
        await testAnthropicKey(apiKey, controller.signal);
        break;
      case "OPENAI":
        await testOpenAiKey(apiKey, controller.signal);
        break;
      case "GOOGLE":
        await testGoogleKey(apiKey, controller.signal);
        break;
      case "GEMMA":
        await testGemmaKey(controller.signal);
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function testAnthropicKey(
  apiKey: string,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
    signal,
  });

  if (res.status === 401) throw new Error("Invalid Anthropic API key");
  if (res.status === 403) throw new Error("Anthropic API key lacks permissions");
  // 200 or any non-auth error = key is valid
  if (res.status >= 500) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API server error ${res.status}: ${body.slice(0, 100)}`);
  }
}

async function testOpenAiKey(
  apiKey: string,
  signal: AbortSignal,
): Promise<void> {
  // Use models endpoint — cheaper than a completions call
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });

  if (res.status === 401) throw new Error("Invalid OpenAI API key");
  if (res.status === 403) throw new Error("OpenAI API key lacks permissions");
  if (res.status >= 500) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI API server error ${res.status}: ${body.slice(0, 100)}`);
  }
}

async function testGoogleKey(
  apiKey: string,
  signal: AbortSignal,
): Promise<void> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const res = await fetch(url, { signal });

  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new Error("Invalid Google AI API key");
  }
  if (res.status >= 500) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google AI server error ${res.status}: ${body.slice(0, 100)}`);
  }
}

async function testGemmaKey(signal: AbortSignal): Promise<void> {
  // Self-hosted Gemma — validate by hitting the health endpoint
  const endpoint = process.env.RESTOREASSIST_AI_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      "RESTOREASSIST_AI_ENDPOINT not configured — cannot validate Gemma connection",
    );
  }
  const healthUrl = endpoint.replace(/\/v1\/?$/, "") + "/health";
  const res = await fetch(healthUrl, { signal }).catch(() => null);
  if (!res || !res.ok) {
    throw new Error("Gemma self-hosted endpoint is unreachable");
  }
}
