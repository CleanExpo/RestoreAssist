/**
 * Platform email config: Mailtrap Sending API only.
 */

export type EmailProviderKind = "mailtrap";

export interface PlatformEmailConfig {
  provider: EmailProviderKind;
  apiKey: string;
  from: string;
  source: "platform";
}

/** True when platform Mailtrap can send. */
export function isEmailServiceConfigured(): boolean {
  return Boolean(
    process.env.MAILTRAP_API_KEY?.trim() && process.env.SENDER_EMAIL?.trim(),
  );
}

/**
 * Resolve the verified "from" address. Requires SENDER_EMAIL.
 */
export function resolveFromAddress(override?: string | null): string {
  if (override?.trim()) return formatFromAddress(override.trim());

  const sender = process.env.SENDER_EMAIL?.trim();
  if (sender) return formatFromAddress(sender);

  throw new Error(
    "SENDER_EMAIL is not configured — refusing to send without a verified sender",
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
 * Resolve Mailtrap credentials for a send.
 * Organization BYOK Resend keys are ignored — outbound mail is Mailtrap only.
 */
export async function resolvePlatformEmailConfig(
  _organizationId?: string | null,
): Promise<PlatformEmailConfig | null> {
  const mailtrapKey = process.env.MAILTRAP_API_KEY?.trim();
  if (!mailtrapKey || !process.env.SENDER_EMAIL?.trim()) {
    return null;
  }
  return {
    provider: "mailtrap",
    apiKey: mailtrapKey,
    from: resolveFromAddress(),
    source: "platform",
  };
}
