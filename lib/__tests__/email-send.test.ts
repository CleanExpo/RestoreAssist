import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reportError = vi.fn();
vi.mock("@/lib/observability", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

import { sendEmail } from "../email-send";

const originalKey = process.env.RESEND_API_KEY;
const fetchMock = vi.fn();

beforeEach(() => {
  reportError.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.RESEND_API_KEY = "re_test_key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalKey === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = originalKey;
  }
});

const payload = {
  to: "customer@example.com",
  subject: "Test subject",
  html: "<p>Hello</p>",
};

describe("sendEmail (lib/email-send)", () => {
  it("is loud (console.error + reportError), not silent, when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;

    await expect(sendEmail(payload)).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[email-send] RESEND_API_KEY is not configured"),
      expect.objectContaining({ subject: "Test subject" }),
    );
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ stage: "email-send-config" }),
    );
  });

  it("passes an abort signal (timeout) and reply_to to the Resend fetch", async () => {
    fetchMock.mockResolvedValue({ ok: true });

    await sendEmail({ ...payload, replyTo: "support@restoreassist.app" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body)).toMatchObject({
      to: ["customer@example.com"],
      reply_to: "support@restoreassist.app",
    });
  });

  it("sends from the VERIFIED env sender (RESEND_FROM_EMAIL), not the bare root domain", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    process.env.RESEND_FROM_EMAIL =
      "RestoreAssist <noreply@send.restoreassist.app>";

    await sendEmail(payload);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.from).toBe("RestoreAssist <noreply@send.restoreassist.app>");
    delete process.env.RESEND_FROM_EMAIL;
  });

  it("never throws when the fetch fails, but reports the error", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(sendEmail(payload)).resolves.toBeUndefined();

    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ stage: "email-send" }),
    );
  });

  it("reports non-2xx Resend responses without throwing", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve("invalid from"),
    });

    await expect(sendEmail(payload)).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[email-send] Resend error 422"),
    );
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ stage: "email-send", resendStatus: 422 }),
    );
  });
});
