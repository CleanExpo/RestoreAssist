import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resendSend } = vi.hoisted(() => ({ resendSend: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { organization: { findUnique: vi.fn().mockResolvedValue(null) } },
}));
vi.mock("@/lib/credential-vault", () => ({ decrypt: (v: string) => v }));

import { sendTransactionalEmail } from "../send-transactional";

const fetchMock = vi.fn();
const original = {
  mailtrap: process.env.MAILTRAP_API_KEY,
  sender: process.env.SENDER_EMAIL,
  resend: process.env.RESEND_API_KEY,
  resendFrom: process.env.RESEND_FROM_EMAIL,
};

beforeEach(() => {
  fetchMock.mockReset();
  resendSend.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  process.env.MAILTRAP_API_KEY = "mt_test_key";
  process.env.SENDER_EMAIL = "support@restoreassist.app";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries({
    MAILTRAP_API_KEY: original.mailtrap,
    SENDER_EMAIL: original.sender,
    RESEND_API_KEY: original.resend,
    RESEND_FROM_EMAIL: original.resendFrom,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("sendTransactionalEmail (Mailtrap)", () => {
  it("POSTs to Mailtrap send API with Bearer token and structured from/to", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ success: true, message_ids: ["mt-msg-1"] }),
    });

    const result = await sendTransactionalEmail({
      to: "tech@example.com",
      subject: "Welcome",
      html: "<p>Hi</p>",
      replyTo: "support@restoreassist.app",
    });

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe("mt-msg-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://send.api.mailtrap.io/api/send");
    expect(opts.headers.Authorization).toBe("Bearer mt_test_key");
    const body = JSON.parse(opts.body);
    expect(body.from).toEqual({
      email: "support@restoreassist.app",
      name: "RestoreAssist",
    });
    expect(body.to).toEqual([{ email: "tech@example.com" }]);
    expect(body.reply_to).toEqual({ email: "support@restoreassist.app" });
  });

  it("returns a structured error on non-2xx without throwing", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ errors: ["unauthorized"] }),
    });

    const result = await sendTransactionalEmail({
      to: "a@b.com",
      subject: "x",
      html: "<p>x</p>",
    });
    expect(result.data).toBeNull();
    expect(result.error?.message).toContain("unauthorized");
    expect(result.error?.name).toBe("mailtrap_401");
  });

  it.each([408, 425, 429, 500, 503])(
    "marks Mailtrap HTTP %i ambiguous because the provider may have accepted it",
    async (status) => {
      fetchMock.mockResolvedValue({
        ok: false,
        status,
        text: async () => JSON.stringify({ errors: ["temporary upstream failure"] }),
      });

      const result = await sendTransactionalEmail({
        to: "a@b.com",
        subject: "x",
        html: "<p>x</p>",
      });

      expect(result).toMatchObject({
        data: null,
        error: { name: "send_failed" },
        provider: "mailtrap",
      });
    },
  );

  it.each([
    ["success=false", { success: false }],
    ["missing message_ids", { success: true }],
    ["empty message id", { success: true, message_ids: ["  "] }],
  ])("refuses HTTP 2xx with %s instead of inventing a receipt", async (_case, body) => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    });

    const result = await sendTransactionalEmail({
      to: "a@b.com",
      subject: "x",
      html: "<p>x</p>",
    });

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ name: "mailtrap_missing_receipt" });
  });
});

describe("sendTransactionalEmail (Resend)", () => {
  beforeEach(() => {
    delete process.env.MAILTRAP_API_KEY;
    delete process.env.SENDER_EMAIL;
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "support@restoreassist.app";
  });

  it("turns data:null,error:null into an explicit missing-receipt failure", async () => {
    resendSend.mockResolvedValueOnce({ data: null, error: null });

    const result = await sendTransactionalEmail({
      to: "a@b.com",
      subject: "x",
      html: "<p>x</p>",
    });

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ name: "resend_missing_receipt" });
  });

  it("returns a trimmed provider receipt on a confirmed send", async () => {
    resendSend.mockResolvedValueOnce({
      data: { id: "  resend-msg-1  " },
      error: null,
    });

    const result = await sendTransactionalEmail({
      to: "a@b.com",
      subject: "x",
      html: "<p>x</p>",
    });

    expect(result).toMatchObject({
      data: { id: "resend-msg-1" },
      error: null,
      provider: "resend",
    });
  });
});
