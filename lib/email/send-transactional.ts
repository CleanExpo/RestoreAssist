/**
 * Unified transactional email send — Mailtrap Sending API or Resend.
 * Returns a Resend-shaped result so existing assertResendSuccess helpers work.
 */

import { Resend } from "resend";
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
  /** Resend SDK compatibility alias */
  reply_to?: string;
  attachments?: TransactionalAttachment[];
  organizationId?: string | null;
  /** Stable logical message identity. Resend supports this natively. */
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
    return {
      data: null,
      error: {
        name: "not_configured",
        message:
          "Email service is not configured (set MAILTRAP_API_KEY + SENDER_EMAIL, or RESEND_API_KEY + RESEND_FROM_EMAIL)",
      },
    };
  }

  const from = input.from?.trim() || config.from;
  const toList = Array.isArray(input.to) ? input.to : [input.to];
  const replyTo = input.replyTo || input.reply_to;

  try {
    if (config.provider === "mailtrap") {
      return await sendViaMailtrap(config, {
        ...input,
        from,
        to: toList,
        replyTo,
      });
    }
    return await sendViaResend(config, {
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

async function sendViaResend(
  config: PlatformEmailConfig,
  input: TransactionalEmailInput & { from: string; to: string[] },
): Promise<TransactionalSendResult> {
  const client = new Resend(config.apiKey);
  const payload = {
    from: input.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    ...(input.text ? { text: input.text } : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    ...(input.attachments?.length
      ? {
          attachments: input.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
          })),
        }
      : {}),
  };

  const result = (await Promise.race([
    client.emails.send(
      payload,
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    ),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`Email send timed out after ${EMAIL_SEND_TIMEOUT_MS}ms`),
          ),
        EMAIL_SEND_TIMEOUT_MS,
      ),
    ),
  ])) as { data: { id: string } | null; error: { message?: string; name?: string } | null };

  const id = result.data?.id?.trim();
  if (result.error || !id) {
    return {
      data: null,
      error:
        result.error ??
        {
          name: "resend_missing_receipt",
          message:
            "Resend returned success without a confirmed provider message ID",
        },
      provider: "resend",
      source: config.source,
    };
  }

  return {
    data: { id },
    error: null,
    provider: "resend",
    source: config.source,
  };
}
