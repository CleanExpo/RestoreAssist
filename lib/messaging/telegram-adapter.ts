/**
 * Text the Job In (S1) — Telegram channel adapter.
 *
 * A dedicated RestoreAssist bot, separate from Hermes.
 *
 *   verify  X-Telegram-Bot-Api-Secret-Token (set via setWebhook secret_token)
 *           compared in constant time against TELEGRAM_JOB_WEBHOOK_SECRET.
 *           Unset secret => every request is rejected.
 *   reply   Bot API sendMessage using TELEGRAM_JOB_BOT_TOKEN. The request URL
 *           contains the token, so it is never logged.
 */

import { createHash, timingSafeEqual } from "crypto";
import type { ChannelAdapter, InboundMessage } from "./types";

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    from?: { id?: number; is_bot?: boolean };
    chat?: { id?: number };
  };
}

export const telegramAdapter: ChannelAdapter = {
  channel: "telegram",

  verify(request: Request): boolean {
    const expected = process.env.TELEGRAM_JOB_WEBHOOK_SECRET;
    if (!expected) return false;
    const received = request.headers.get(SECRET_HEADER);
    if (!received) return false;
    // Hash both sides so the comparison is fixed-length and leaks nothing
    // about the secret's length.
    return timingSafeEqual(digest(received), digest(expected));
  },

  parse(rawBody: string): InboundMessage | null {
    let update: TelegramUpdate;
    try {
      update = JSON.parse(rawBody) as TelegramUpdate;
    } catch {
      return null;
    }
    const msg = update.message;
    if (
      typeof update.update_id !== "number" ||
      !msg ||
      typeof msg.text !== "string" ||
      typeof msg.from?.id !== "number" ||
      msg.from.is_bot ||
      typeof msg.chat?.id !== "number"
    ) {
      return null;
    }
    return {
      externalId: `telegram:${update.update_id}`,
      address: String(msg.from.id),
      replyTo: String(msg.chat.id),
      text: msg.text,
      mediaRefs: [],
    };
  },

  async reply(replyTo: string, text: string): Promise<void> {
    const token = process.env.TELEGRAM_JOB_BOT_TOKEN;
    if (!token) {
      throw new Error("TELEGRAM_JOB_BOT_TOKEN is not configured");
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: replyTo, text }),
    });
    if (!res.ok) {
      throw new Error(`Telegram sendMessage failed with status ${res.status}`);
    }
  },

  async fetchMedia(): Promise<Uint8Array> {
    throw new Error("Media is not supported until Text the Job In S2");
  },
};
