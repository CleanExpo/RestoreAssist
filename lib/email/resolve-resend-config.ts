/**
 * Resolve Resend API credentials: org BYOK first, then platform Resend.
 * When MAILTRAP_API_KEY is the platform provider, returns null for
 * Resend-only callers — use resolvePlatformEmailConfig / sendTransactionalEmail
 * for new code.
 */

import { resolvePlatformEmailConfig } from "@/lib/email/resolve-platform-config";

export interface ResendConfig {
  apiKey: string;
  from: string;
  source: "byok" | "platform";
}

export async function resolveResendConfig(
  organizationId?: string | null,
): Promise<ResendConfig | null> {
  const config = await resolvePlatformEmailConfig(organizationId);
  if (!config || config.provider !== "resend") return null;
  return {
    apiKey: config.apiKey,
    from: config.from,
    source: config.source,
  };
}

/** Lightweight authenticated ping before storing a BYOK key. */
export async function validateResendApiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok || res.status === 403;
  } catch {
    return false;
  }
}
