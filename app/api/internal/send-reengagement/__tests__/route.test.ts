import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/email-send", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

import { sendEmail } from "@/lib/email-send";
import { POST } from "../route";

const send = sendEmail as unknown as ReturnType<typeof vi.fn>;
const TOKEN = "test-token-123";

function req(body: unknown, auth?: string) {
  return new NextRequest("https://restoreassist.app/api/internal/send-reengagement", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.REENGAGEMENT_SEND_TOKEN = TOKEN;
  process.env.RESEND_API_KEY = "re_test";
  process.env.NEXTAUTH_URL = "https://restoreassist.app";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.REENGAGEMENT_SEND_TOKEN;
});

describe("POST /api/internal/send-reengagement", () => {
  it("401s without a token, and never sends", async () => {
    const res = await POST(req({ recipientEmail: "a@b.com" }));
    expect(res.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it("401s on a wrong token", async () => {
    const res = await POST(req({ recipientEmail: "a@b.com" }, "Bearer nope"));
    expect(res.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it("401s (fails closed) when the server token is unset", async () => {
    delete process.env.REENGAGEMENT_SEND_TOKEN;
    const res = await POST(req({ recipientEmail: "a@b.com" }, `Bearer ${TOKEN}`));
    expect(res.status).toBe(401);
  });

  it("400s on a missing/invalid recipient email", async () => {
    expect((await POST(req({}, `Bearer ${TOKEN}`))).status).toBe(400);
    expect(
      (await POST(req({ recipientEmail: "not-an-email" }, `Bearer ${TOKEN}`)))
        .status,
    ).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the branded email with reply-to on a valid authed request", async () => {
    process.env.RESEND_REPLY_TO = "airestoreassist@gmail.com";
    const res = await POST(
      req(
        { recipientEmail: "ryan.morey@outlook.com.au", recipientName: "Ryan" },
        `Bearer ${TOKEN}`,
      ),
    );
    const json = await res.json();

    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.to).toBe("ryan.morey@outlook.com.au");
    expect(arg.replyTo).toBe("airestoreassist@gmail.com");
    expect(arg.html).toContain("Hi Ryan,");
    expect(arg.html).toContain("utm_source=reengagement");
    expect(json).toMatchObject({ sent: true, to: "ryan.morey@outlook.com.au" });
    delete process.env.RESEND_REPLY_TO;
  });

  it("ignores a non-root-relative ctaPath (no open redirect)", async () => {
    await POST(
      req(
        { recipientEmail: "a@b.com", ctaPath: "https://evil.com/x" },
        `Bearer ${TOKEN}`,
      ),
    );
    const arg = send.mock.calls[0][0];
    expect(arg.html).not.toContain("evil.com");
    expect(arg.html).toContain("/dashboard/pricing");
  });

  it("returns sent:false (not a send) when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await POST(
      req({ recipientEmail: "a@b.com" }, `Bearer ${TOKEN}`),
    );
    expect((await res.json()).sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
