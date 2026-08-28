import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/ios-billing-guard", () => ({
  rejectIfIOSCapacitor: vi.fn(() => null),
}));

const stripeMock = vi.hoisted(() => ({
  checkout: { sessions: { create: vi.fn() } },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

import { POST } from "../route";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://restoreassist.app/api/revenue/job-file-audit/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/revenue/job-file-audit/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = "https://restoreassist.app";
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: "cs_audit_1",
      url: "https://checkout.stripe.com/c/pay/audit",
    });
  });

  it("creates the A$149 single-audit checkout with server-authoritative pricing", async () => {
    const response = await POST(makeRequest({ package: "single" }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.url).toBe("https://checkout.stripe.com/c/pay/audit");

    const session = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(session.mode).toBe("payment");
    expect(session.line_items[0].price_data).toMatchObject({
      currency: "aud",
      unit_amount: 14900,
      tax_behavior: "exclusive",
    });
    expect(session.automatic_tax).toEqual({ enabled: true });
    expect(session.tax_id_collection).toEqual({ enabled: true });
    expect(session.metadata).toEqual({
      offer: "job-file-audit",
      package: "single",
      includedAudits: "1",
    });
    expect(session.payment_intent_data.metadata).toEqual({
      userId: "public-job-file-audit",
      type: "job_file_audit",
    });
  });

  it("creates the A$399 three-job package without accepting a client price", async () => {
    const response = await POST(
      makeRequest({ package: "three", amount: 1, currency: "usd" }),
    );

    expect(response.status).toBe(200);
    const session = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(session.line_items[0].price_data.unit_amount).toBe(39900);
    expect(session.line_items[0].price_data.currency).toBe("aud");
    expect(session.metadata.includedAudits).toBe("3");
  });

  it("uses the trusted app URL instead of request Origin or Host headers", async () => {
    await POST(
      makeRequest(
        { package: "single" },
        { origin: "https://evil.example", host: "evil.example" },
      ),
    );

    const session = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(session.success_url).toBe(
      "https://restoreassist.app/job-file-audit/intake?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(session.cancel_url).toBe(
      "https://restoreassist.app/job-file-audit?canceled=true",
    );
    expect(session.success_url).not.toContain("evil.example");
  });

  it("rejects an unknown package before Stripe is called", async () => {
    const response = await POST(makeRequest({ package: "enterprise" }));

    expect(response.status).toBe(400);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
