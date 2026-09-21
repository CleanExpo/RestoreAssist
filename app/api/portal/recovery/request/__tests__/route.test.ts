import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn() }));
vi.mock("@/lib/portal/request-invitation-resend", () => ({
  requestPortalInvitationResend: vi.fn(),
}));

import { applyRateLimit } from "@/lib/rate-limiter";
import { requestPortalInvitationResend } from "@/lib/portal/request-invitation-resend";
import { GENERIC_INVITE_RESEND_MESSAGE } from "@/lib/portal/recovery-paths";
import { POST } from "../route";

const mRate = applyRateLimit as unknown as ReturnType<typeof vi.fn>;
const mRequest = requestPortalInvitationResend as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.clearAllMocks();
  mRate.mockResolvedValue(null);
});

function req(body: unknown) {
  return new NextRequest("http://localhost/api/portal/recovery/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/portal/recovery/request", () => {
  it("never discloses whether the email matched", async () => {
    mRequest.mockResolvedValue({
      ok: true,
      data: { message: GENERIC_INVITE_RESEND_MESSAGE, matched: true },
    });
    const matched = await POST(req({ email: "client@example.com" }));
    expect(matched.status).toBe(200);
    expect(await matched.json()).toEqual({
      message: GENERIC_INVITE_RESEND_MESSAGE,
    });

    mRequest.mockResolvedValue({
      ok: true,
      data: { message: GENERIC_INVITE_RESEND_MESSAGE, matched: false },
    });
    const missing = await POST(req({ email: "nobody@example.com" }));
    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual({
      message: GENERIC_INVITE_RESEND_MESSAGE,
    });
  });

  it("returns 400 for an invalid email without calling the matcher as success", async () => {
    mRequest.mockResolvedValue({
      ok: false,
      reason: "invalid_email",
      detail: "Enter a valid email address",
    });
    const res = await POST(req({ email: "nope" }));
    expect(res.status).toBe(400);
  });
});
