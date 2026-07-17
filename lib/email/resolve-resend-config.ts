/**
 * Resolve Resend API credentials: org BYOK first, then platform env.
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/credential-vault";

export interface ResendConfig {
  apiKey: string;
  from: string;
  source: "byok" | "platform";
}

function platformFrom(): string {
  return (
    process.env.RESEND_FROM_EMAIL ||
    "RestoreAssist <noreply@restoreassist.app>"
  );
}

export async function resolveResendConfig(
  organizationId?: string | null,
): Promise<ResendConfig | null> {
  if (organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        emailProvider: true,
        emailProviderEncryptedKey: true,
        emailFromAddress: true,
      },
    });
    if (
      org?.emailProvider === "RESEND" &&
      org.emailProviderEncryptedKey
    ) {
      try {
        const apiKey = decrypt(org.emailProviderEncryptedKey);
        if (apiKey.trim()) {
          return {
            apiKey,
            from: org.emailFromAddress?.trim() || platformFrom(),
            source: "byok",
          };
        }
      } catch (err) {
        console.error("[email] failed to decrypt org Resend key:", err);
      }
    }
  }

  const platformKey = process.env.RESEND_API_KEY;
  if (!platformKey) return null;
  return {
    apiKey: platformKey,
    from: platformFrom(),
    source: "platform",
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
