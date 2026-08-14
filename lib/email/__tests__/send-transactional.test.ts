import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  });
});
