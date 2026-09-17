import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { telegramAdapter } from "../telegram-adapter";
import { getChannelAdapter } from "../adapters";

const SECRET = "fake-webhook-secret";

function req(secret?: string): Request {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers["x-telegram-bot-api-secret-token"] = secret;
  return new Request("http://localhost/x", { method: "POST", headers });
}

beforeEach(() => {
  process.env.TELEGRAM_JOB_WEBHOOK_SECRET = SECRET;
  process.env.TELEGRAM_JOB_BOT_TOKEN = "fake-bot-token";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_JOB_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_JOB_BOT_TOKEN;
});

describe("telegramAdapter.verify", () => {
  it("accepts the configured secret", () => {
    expect(telegramAdapter.verify(req(SECRET), "")).toBe(true);
  });

  it("rejects a wrong or missing secret", () => {
    expect(telegramAdapter.verify(req("wrong"), "")).toBe(false);
    expect(telegramAdapter.verify(req(), "")).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    delete process.env.TELEGRAM_JOB_WEBHOOK_SECRET;
    expect(telegramAdapter.verify(req(""), "")).toBe(false);
    expect(telegramAdapter.verify(req("anything"), "")).toBe(false);
  });
});

describe("telegramAdapter.parse", () => {
  const good = {
    update_id: 42,
    message: {
      message_id: 7,
      text: "wall 30%",
      from: { id: 1001, is_bot: false },
      chat: { id: -55 },
    },
  };

  it("reads a text message", () => {
    expect(telegramAdapter.parse(JSON.stringify(good))).toEqual({
      externalId: "telegram:42",
      address: "1001",
      replyTo: "-55",
      text: "wall 30%",
      mediaRefs: [],
    });
  });

  it("ignores bad JSON, non-text and bot messages", () => {
    expect(telegramAdapter.parse("{nope")).toBeNull();
    expect(
      telegramAdapter.parse(
        JSON.stringify({ ...good, message: { ...good.message, text: undefined } }),
      ),
    ).toBeNull();
    expect(
      telegramAdapter.parse(
        JSON.stringify({
          ...good,
          message: { ...good.message, from: { id: 1, is_bot: true } },
        }),
      ),
    ).toBeNull();
    expect(telegramAdapter.parse(JSON.stringify({ update_id: 1 }))).toBeNull();
  });
});

describe("telegramAdapter.reply", () => {
  it("posts sendMessage with the chat id and text", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await telegramAdapter.reply("-55", "hello");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/botfake-bot-token/sendMessage");
    expect(JSON.parse(String(init.body))).toEqual({ chat_id: "-55", text: "hello" });
  });

  it("throws on a failed send without echoing the URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    await expect(telegramAdapter.reply("1", "x")).rejects.toThrow(/status 403/);
    await expect(telegramAdapter.reply("1", "x")).rejects.not.toThrow(/fake-bot-token/);
  });

  it("throws when no bot token is configured", async () => {
    delete process.env.TELEGRAM_JOB_BOT_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(telegramAdapter.reply("1", "x")).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("telegramAdapter.fetchMedia", () => {
  it("is not available in S1", async () => {
    await expect(telegramAdapter.fetchMedia("ref")).rejects.toThrow(/S2/);
  });
});

describe("getChannelAdapter", () => {
  it("knows telegram and nothing else", () => {
    expect(getChannelAdapter("telegram")).toBe(telegramAdapter);
    expect(getChannelAdapter("sms")).toBeNull();
    expect(getChannelAdapter("toString")).toBeNull();
  });
});
