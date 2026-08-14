/**
 * Platform email config: Mailtrap (preferred when MAILTRAP_API_KEY is set)
 * or Resend. Org BYOK Resend still wins when an organizationId is supplied.
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/credential-vault";

export type EmailProviderKind = "mailtrap" | "resend";

export interface PlatformEmailConfig {
  provider: EmailProviderKind;
  apiKey: string;
  from: string;
  source: "byok" | "platform";
}

/** True when any platform (or org) send path can work without a BYOK org. */
export function isEmailServiceConfigured(): boolean {
  return Boolean(
    process.env.MAILTRAP_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim(),
  );
}

/**
 * Resolve the verified "from" address.
 * Prefer SENDER_EMAIL (Mailtrap / product default), then RESEND_FROM_EMAIL.
 */
export function resolveFromAddress(override?: string | null): string {
  if (override?.trim()) return formatFromAddress(override.trim());

  const sender = process.env.SENDER_EMAIL?.trim();
  if (sender) return formatFromAddress(sender);

  const resendFrom = process.env.RESEND_FROM_EMAIL?.trim();
  if (resendFrom) return formatFromAddress(resendFrom);

  throw new Error(
    "SENDER_EMAIL (or RESEND_FROM_EMAIL) is not configured — refusing to send without a verified sender",
  );
}

/** "support@x.com" → "RestoreAssist <support@x.com>"; leave "Name <email>" alone. */
export function formatFromAddress(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("<") && trimmed.includes(">")) return trimmed;
  return `RestoreAssist <${trimmed}>`;
}

export function parseFromAddress(from: string): { email: string; name?: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].replace(/^["']|["']$/g, "").trim();
    return { email: match[2].trim(), ...(name ? { name } : {}) };
  }
  return { email: from.trim() };
}

/**
 * Resolve credentials for a send.
 * Order: org BYOK Resend → Mailtrap platform → Resend platform.
 */
export async function resolvePlatformEmailConfig(
  organizationId?: string | null,
): Promise<PlatformEmailConfig | null> {
  if (organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        emailProvider: true,
        emailProviderEncryptedKey: true,
        emailFromAddress: true,
      },
    });
    if (org?.emailProvider === "RESEND" && org.emailProviderEncryptedKey) {
      try {
        const apiKey = decrypt(org.emailProviderEncryptedKey);
        if (apiKey.trim()) {
          return {
            provider: "resend",
            apiKey,
            from: resolveFromAddress(org.emailFromAddress),
            source: "byok",
          };
        }
      } catch (err) {
        console.error("[email] failed to decrypt org Resend key:", err);
      }
    }
  }

  const mailtrapKey = process.env.MAILTRAP_API_KEY?.trim();
  if (mailtrapKey) {
    return {
      provider: "mailtrap",
      apiKey: mailtrapKey,
      from: resolveFromAddress(),
      source: "platform",
    };
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    return {
      provider: "resend",
      apiKey: resendKey,
      from: resolveFromAddress(),
      source: "platform",
    };
  }

  return null;
}
