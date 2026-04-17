/**
 * OAuth Handler Utilities
 * Provides encryption, decryption, and token management for external integrations
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/credential-vault";

/**
 * Encrypt a token for secure storage (delegates to credential vault)
 */
export function encryptToken(token: string): string {
  return encrypt(token);
}

/**
 * Decrypt a stored token (delegates to credential vault)
 */
export function decryptToken(encryptedToken: string): string {
  return decrypt(encryptedToken);
}

/**
 * Store OAuth tokens for an integration
 */
export async function storeTokens(
  integrationId: string,
  accessToken: string,
  refreshToken?: string,
  expiresIn?: number, // seconds until expiry
): Promise<void> {
  const encryptedAccess = encryptToken(accessToken);
  const encryptedRefresh = refreshToken ? encryptToken(refreshToken) : null;

  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : null;

  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      tokenExpiresAt,
      status: "CONNECTED",
      syncError: null,
    },
  });
}

/**
 * Retrieve decrypted tokens for an integration
 */
export async function getTokens(integrationId: string): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  isExpired: boolean;
}> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: {
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
    },
  });

  if (!integration) {
    throw new Error("Integration not found");
  }

  const accessToken = integration.accessToken
    ? decryptToken(integration.accessToken)
    : null;
  const refreshToken = integration.refreshToken
    ? decryptToken(integration.refreshToken)
    : null;

  const isExpired = integration.tokenExpiresAt
    ? new Date() > integration.tokenExpiresAt
    : false;

  return {
    accessToken,
    refreshToken,
    tokenExpiresAt: integration.tokenExpiresAt,
    isExpired,
  };
}

/**
 * Mark integration as having an error
 */
export async function markIntegrationError(
  integrationId: string,
  error: string,
): Promise<void> {
  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      status: "ERROR",
      syncError: error,
    },
  });
}

/**
 * Mark integration as disconnected
 */
export async function disconnectIntegration(
  integrationId: string,
): Promise<void> {
  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      status: "DISCONNECTED",
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      tenantId: null,
      realmId: null,
      companyId: null,
      syncError: null,
    },
  });
}

/**
 * Log a sync operation
 */
export async function logSync(
  integrationId: string,
  syncType: "CLIENTS" | "JOBS" | "FULL",
  status: "SUCCESS" | "FAILED" | "PARTIAL",
  recordsProcessed: number,
  recordsFailed: number = 0,
  errorMessage?: string,
): Promise<void> {
  await prisma.integrationSyncLog.create({
    data: {
      integrationId,
      syncType,
      status,
      recordsProcessed,
      recordsFailed,
      errorMessage,
      completedAt: new Date(),
    },
  });

  // Update last sync time on integration
  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      lastSyncAt: new Date(),
      syncError: errorMessage || null,
    },
  });
}

/**
 * OAuth state generation and validation
 */
/**
 * RA-1285: OAuth state generation now persists the nonce to DB so it can
 * be validated once + invalidated on use. Previous impl encoded state as
 * base64 JSON with the nonce never looked up — replay attacks within the
 * 10-min TTL were possible. Now: generate → store → callback looks up
 * by nonce → marks used → rejects second use.
 */
export async function generateOAuthState(
  userId: string,
  provider: string,
): Promise<string> {
  const nonce = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min TTL

  await (prisma as any).oAuthStateNonce.create({
    data: { nonce, userId, provider, expiresAt },
  });

  // The nonce IS the state — no JSON payload required. userId and
  // provider are resolved from the DB row on callback.
  return nonce;
}

export async function validateOAuthState(state: string): Promise<{
  userId: string;
  provider: string;
} | null> {
  try {
    // One-shot: findUnique → check expiry + usedAt → mark used. Using
    // updateMany with a usedAt=null guard makes it atomic; count 0
    // means someone else already consumed it (or it was invalid).
    const row = (await (prisma as any).oAuthStateNonce.findUnique({
      where: { nonce: state },
    })) as {
      userId: string;
      provider: string;
      expiresAt: Date;
      usedAt: Date | null;
    } | null;

    if (!row || row.usedAt || row.expiresAt < new Date()) {
      return null;
    }

    const result = await (prisma as any).oAuthStateNonce.updateMany({
      where: { nonce: state, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (result.count === 0) return null; // race: used by another callback

    return { userId: row.userId, provider: row.provider };
  } catch (err) {
    console.error("[oauth-handler] validateOAuthState error:", err);
    return null;
  }
}

/**
 * PKCE utilities for OAuth 2.0 with PKCE
 */
export function generatePKCE(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  // Generate a cryptographically random code verifier (43-128 characters)
  const codeVerifier = crypto.randomBytes(32).toString("base64url");

  // Generate code challenge using SHA-256
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { codeVerifier, codeChallenge };
}

/**
 * Provider-specific configuration
 */
export const PROVIDER_CONFIG = {
  XERO: {
    name: "Xero",
    icon: "/integrations/xero.svg",
    authUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    apiBaseUrl: "https://api.xero.com/api.xro/2.0",
    scopes: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "accounting.contacts",
      "accounting.transactions",
    ],
    usePKCE: true,
  },
  QUICKBOOKS: {
    name: "QuickBooks",
    icon: "/integrations/quickbooks.svg",
    authUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    apiBaseUrl: "https://quickbooks.api.intuit.com/v3/company",
    scopes: ["com.intuit.quickbooks.accounting"],
    usePKCE: false,
  },
  MYOB: {
    name: "MYOB",
    icon: "/integrations/myob.svg",
    authUrl: "https://secure.myob.com/oauth2/account/authorize",
    tokenUrl: "https://secure.myob.com/oauth2/v1/authorize",
    apiBaseUrl: "https://api.myob.com/accountright",
    scopes: ["CompanyFile"],
    usePKCE: false,
  },
  SERVICEM8: {
    name: "ServiceM8",
    icon: "/integrations/servicem8.svg",
    authUrl: "https://go.servicem8.com/oauth/authorize",
    tokenUrl: "https://go.servicem8.com/oauth/access_token",
    apiBaseUrl: "https://api.servicem8.com/api_1.0",
    scopes: ["read_clients", "read_jobs"],
    usePKCE: false,
  },
  ASCORA: {
    name: "Ascora",
    icon: "/integrations/ascora.svg",
    authUrl: "https://api.ascora.com.au/oauth/authorize",
    tokenUrl: "https://api.ascora.com.au/oauth/token",
    apiBaseUrl: "https://api.ascora.com.au/api/v1",
    scopes: ["read"],
    usePKCE: false,
  },
} as const;

export type IntegrationProvider = keyof typeof PROVIDER_CONFIG;
