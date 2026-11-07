/**
 * Unified transactional email send — Mailtrap Sending API only.
 * Returns `{ data: { id } }` so existing receipt helpers keep working.
 */

import {
  parseFromAddress,
  resolvePlatformEmailConfig,
  type PlatformEmailConfig,
} from "@/lib/email/resolve-platform-config";

export const EMAIL_SEND_TIMEOUT_MS = 10_000;

export interface TransactionalAttachment {
  filename: string;
  /** Base64 content (no data: prefix) */
  content: string;
  contentType?: string;
}

export interface TransactionalEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  /** Alias for replyTo */
  reply_to?: string;
  attachments?: TransactionalAttachment[];
  /** Extra message headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
  organizationId?: string | null;
  /** Stable logical message identity (logged; Mailtrap has no idempotency key). */
  idempotencyKey?: string;
}

export interface TransactionalSendResult {
  data: { id: string } | null;
  error: { message?: string; name?: string } | null;
  provider?: PlatformEmailConfig["provider"];
  source?: PlatformEmailConfig["source"];
}

const MAILTRAP_SEND_URL = "https://send.api.mailtrap.io/api/send";

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalSendResult> {
  const config = await resolvePlatformEmailConfig(input.organizationId);
  if (!config) {
    // Secret-free: no key, sender or recipient is logged.
    console.warn(
      "[email] transactional send skipped: not_configured (MAILTRAP_API_KEY + SENDER_EMAIL missing)",
    );
    return {
      data: null,
      error: {
        name: "not_configured",
        message:
          "Email service is not configured (set MAILTRAP_API_KEY + SENDER_EMAIL)",
      },
    };
  }

  const from = input.from?.trim() || config.from;
  const toList = Array.isArray(input.to) ? input.to : [input.to];
  // An explicit caller reply-to wins; otherwise default to EMAIL_REPLY_TO.
  // Blank/missing env means no reply_to field at all.
  const replyTo =
    input.replyTo?.trim() ||
    input.reply_to?.trim() ||
    process.env.EMAIL_REPLY_TO?.trim() ||
    undefined;

  try {
    return await sendViaMailtrap(config, {
      ...input,
      from,
      to: toList,
      replyTo,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: null,
      error: { name: "send_failed", message },
      provider: config.provider,
      source: config.source,
    };
  }
}

async function sendViaMailtrap(
  config: PlatformEmailConfig,
  input: TransactionalEmailInput & { from: string; to: string[] },
): Promise<TransactionalSendResult> {
  const fromParsed = parseFromAddress(input.from);
  const body: Record<string, unknown> = {
    from: fromParsed,
    to: input.to.map((email) => ({ email })),
    subject: input.subject,
    html: input.html,
  };
  if (input.text) body.text = input.text;
  if (input.replyTo) {
    body.reply_to = parseFromAddress(input.replyTo);
  }
  if (input.headers && Object.keys(input.headers).length > 0) {
    body.headers = input.headers;
  }
  if (input.attachments?.length) {
    body.attachments = input.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      type: a.contentType || "application/octet-stream",
      disposition: "attachment",
    }));
  }

  const res = await fetch(MAILTRAP_SEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      // Mailtrap edge protection prefers a normal UA
      "User-Agent": "RestoreAssist/1.0",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(EMAIL_SEND_TIMEOUT_MS),
  });

  const text = await res.text().catch(() => "");
  let parsed: { message_ids?: string[]; success?: boolean; errors?: string[] } =
    {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    // Mailtrap does not provide a request idempotency key. A timeout-like HTTP
    // response can arrive after the provider accepted the message, so those
    // outcomes must remain ambiguous and must never be automatically resent.
    const ambiguousStatus =
      res.status === 408 ||
      res.status === 425 ||
      res.status === 429 ||
      res.status >= 500;
    return {
      data: null,
      error: {
        name: ambiguousStatus ? "send_failed" : `mailtrap_${res.status}`,
        message:
          parsed.errors?.join("; ") ||
          text ||
          `Mailtrap send failed with status ${res.status}`,
      },
      provider: "mailtrap",
      source: config.source,
    };
  }

  const id = parsed.message_ids?.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  )?.trim();
  if (parsed.success !== true || !id) {
    return {
      data: null,
      error: {
        name: "mailtrap_missing_receipt",
        message:
          "Mailtrap returned HTTP success without a confirmed provider message ID",
      },
      provider: "mailtrap",
      source: config.source,
    };
  }
  return {
    data: { id },
    error: null,
    provider: "mailtrap",
    source: config.source,
  };
}
