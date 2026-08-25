import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/email-send", () => ({ sendEmail: vi.fn().mockResolvedValue("msg_reengagement_1") }));
vi.mock("@/lib/admin-auth", () => ({ verifyAdminFromDb: vi.fn() }));
// Pass-through idempotency: hand the callback the request's raw JSON body.
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(async (req: Request, _uid: string, fn: (raw: string) => unknown) =>
    fn(await req.text()),
  ),
}));

import { getServerSession } from "next-auth";
import { sendEmail } from "@/lib/email-send";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { POST } from "../route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const admin = verifyAdminFromDb as unknown as ReturnType<typeof vi.fn>;
const send = sendEmail as unknown as ReturnType<typeof vi.fn>;

function post(body: unknown) {
  return new Request("http://localhost/api/notifications/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = "re_test";
  process.env.NEXTAUTH_URL = "https://restoreassist.app";
  session.mockResolvedValue({ user: { id: "u1", name: "Phill", role: "ADMIN" } });
  admin.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } }); // authorised
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.MAILTRAP_API_KEY;
  delete process.env.SENDER_EMAIL;
});

describe("POST customer_reengagement", () => {
  it("admin send: sends to the recipient with reply-to and returns sent:true", async () => {
    process.env.RESEND_REPLY_TO = "airestoreassist@gmail.com";
    const res = await POST(post({
      event: "customer_reengagement",
      recipientEmail: "ryan.morey@outlook.com.au",
      recipientName: "Ryan",
    }) as never);
    const json = await res.json();

    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.to).toBe("ryan.morey@outlook.com.au");
    expect(arg.replyTo).toBe("airestoreassist@gmail.com");
    expect(arg.subject).toContain("Pick up where you left off");
    expect(arg.html).toContain("Hi Ryan,");
    expect(json).toMatchObject({ sent: true, event: "customer_reengagement" });
    delete process.env.RESEND_REPLY_TO;
  });

  it("non-admin is blocked (403) and no email is sent", async () => {
    admin.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    const res = await POST(post({
      event: "customer_reengagement",
      recipientEmail: "ryan.morey@outlook.com.au",
    }) as never);
    expect(res.status).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });

  it("no RESEND key: returns sent:false without attempting a send", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.MAILTRAP_API_KEY;
    delete process.env.SENDER_EMAIL;
    const res = await POST(post({
      event: "customer_reengagement",
      recipientEmail: "ryan.morey@outlook.com.au",
    }) as never);
    const json = await res.json();
    expect(json.sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("uses configured Mailtrap when Resend is absent", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.MAILTRAP_API_KEY = "mt_test";
    process.env.SENDER_EMAIL = "support@restoreassist.app";

    const res = await POST(post({
      event: "customer_reengagement",
      recipientEmail: "ryan.morey@outlook.com.au",
    }) as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not surface sent:true when the provider supplies no receipt", async () => {
    send.mockResolvedValueOnce(null);
    const res = await POST(post({
      event: "customer_reengagement",
      recipientEmail: "ryan.morey@outlook.com.au",
    }) as never);

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ sent: false });
  });
});
