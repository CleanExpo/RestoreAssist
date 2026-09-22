/**
 * RA-7647 — the customer re-engagement email goes to an arbitrary address
 * from RestoreAssist's verified sender, so it is RestoreAssist staff work.
 * Every self-signup is role ADMIN, so `verifyAdminFromDb` alone let any trial
 * business send branded mail to anyone. The real admin-auth helpers run here;
 * only their inputs (session, user row, allowlist env) are controlled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const sendEmail = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}));
vi.mock("@/lib/email-send", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    req: Request,
    _uid: string,
    fn: (raw: string) => unknown,
  ) => fn(await req.text()),
}));

import { POST } from "../route";

function reengage() {
  return new Request("http://localhost/api/notifications/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event: "customer_reengagement",
      recipientEmail: "anyone@example.com",
      recipientName: "Ryan",
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("MAILTRAP_API_KEY", "mt_test");
  vi.stubEnv("SENDER_EMAIL", "support@restoreassist.app");
  getServerSession.mockResolvedValue({
    user: { id: "admin-1", role: "ADMIN", name: "Trial Owner" },
  });
  userFindUnique.mockResolvedValue({
    id: "admin-1",
    role: "ADMIN",
    organizationId: "org-trial",
  });
  sendEmail.mockResolvedValue("msg_1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/notifications/email customer_reengagement (RA-7647)", () => {
  it("refuses a tenant ADMIN who is not on the staff allowlist and sends nothing", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "someone-else");

    const res = await POST(reengage() as never);

    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses everyone when the allowlist is unset (fails closed)", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");

    const res = await POST(reengage() as never);

    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends for an allowlisted staff ADMIN", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "admin-1");

    const res = await POST(reengage() as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
