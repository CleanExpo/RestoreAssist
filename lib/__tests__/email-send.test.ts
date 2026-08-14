import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reportError = vi.fn();
vi.mock("@/lib/observability", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { organization: { findUnique: vi.fn().mockResolvedValue(null) } },
}));
vi.mock("@/lib/credential-vault", () => ({ decrypt: (v: string) => v }));

import { sendEmail } from "../email-send";

const original = {
  mailtrap: process.env.MAILTRAP_API_KEY,
  sender: process.env.SENDER_EMAIL,
  resend: process.env.RESEND_API_KEY,
  resendFrom: process.env.RESEND_FROM_EMAIL,
};
const fetchMock = vi.fn();

beforeEach(() => {
  reportError.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  process.env.MAILTRAP_API_KEY = "mt_test_key";
  process.env.SENDER_EMAIL = "support@restoreassist.app";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

const payload = {
  to: "customer@example.com",
  subject: "Test subject",
  html: "<p>Hello</p>",
};

describe("sendEmail (lib/email-send)", () => {
  it("is loud when no email provider key is configured", async () => {
    delete process.env.MAILTRAP_API_KEY;
    delete process.env.RESEND_API_KEY;

    await expect(sendEmail(payload)).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ stage: "email-send-config" }),
    );
  });

  it("sends via Mailtrap with SENDER_EMAIL as from", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ message_ids: ["1"] }),
    });

    await sendEmail({ ...payload, replyTo: "support@restoreassist.app" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://send.api.mailtrap.io/api/send");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(options.body);
    expect(body.from.email).toBe("support@restoreassist.app");
    expect(body.to).toEqual([{ email: "customer@example.com" }]);
    expect(body.reply_to.email).toBe("support@restoreassist.app");
  });

  it("never throws when the fetch fails, but reports the error", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(sendEmail(payload)).resolves.toBeUndefined();

    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ stage: "email-send" }),
    );
  });

  it("reports non-2xx Mailtrap responses without throwing", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve(JSON.stringify({ errors: ["invalid from"] })),
    });

    await expect(sendEmail(payload)).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalled();
  });
});
