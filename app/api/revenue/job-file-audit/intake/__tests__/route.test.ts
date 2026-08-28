import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));

const stripeMock = vi.hoisted(() => ({
  checkout: { sessions: { retrieve: vi.fn() } },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

const prismaMock = vi.hoisted(() => ({
  supportTicket: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "../route";

const validBody = {
  sessionId: "cs_audit_paid_123456",
  name: "Alex Restorer",
  email: "payer@example.com",
  businessName: "Example Restoration",
  phone: "0400000000",
  jobReference: "JOB-101",
  jobSummary:
    "Please review the moisture chronology and whether the supporting photographs clearly follow the drying sequence.",
  website: "",
};

function makeRequest(body: unknown) {
  return new NextRequest("https://restoreassist.app/api/revenue/job-file-audit/intake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/revenue/job-file-audit/intake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripeMock.checkout.sessions.retrieve.mockResolvedValue({
      id: validBody.sessionId,
      payment_status: "paid",
      customer_details: { email: "payer@example.com" },
      metadata: {
        offer: "job-file-audit",
        package: "single",
        includedAudits: "1",
      },
    });
    prismaMock.supportTicket.create.mockResolvedValue({ id: "ticket_1" });
  });

  it("verifies payment before creating a high-priority fulfilment ticket", async () => {
    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.id).toBe("ticket_1");
    expect(stripeMock.checkout.sessions.retrieve).toHaveBeenCalledWith(
      validBody.sessionId,
    );
    expect(prismaMock.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalReference:
          "stripe:job-file-audit:cs_audit_paid_123456",
        email: validBody.email,
        name: validBody.name,
        subject: "PAID Job File Audit — Example Restoration",
        priority: "high",
      }),
    });
    const ticketBody = prismaMock.supportTicket.create.mock.calls[0][0].data.body;
    expect(ticketBody).toContain("Stripe checkout session: cs_audit_paid_123456");
    expect(ticketBody).toContain("Package: single (1 audit)");
    expect(ticketBody).toContain("secure file-sharing channel");
  });

  it("refuses an unpaid checkout session", async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValue({
      id: validBody.sessionId,
      payment_status: "unpaid",
      metadata: { offer: "job-file-audit" },
    });

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(402);
    expect(prismaMock.supportTicket.create).not.toHaveBeenCalled();
  });

  it("refuses a paid Stripe session belonging to another offer", async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValue({
      id: validBody.sessionId,
      payment_status: "paid",
      metadata: { offer: "different-offer" },
    });

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(402);
    expect(prismaMock.supportTicket.create).not.toHaveBeenCalled();
  });

  it("binds fulfilment to the payer email without disclosing it", async () => {
    const response = await POST(
      makeRequest({ ...validBody, email: "attacker@example.com" }),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("payer@example.com");
    expect(prismaMock.supportTicket.create).not.toHaveBeenCalled();
  });

  it("rejects replay after the database uniqueness boundary consumes the session", async () => {
    prismaMock.supportTicket.create.mockRejectedValue({ code: "P2002" });

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(409);
    expect(prismaMock.supportTicket.create).toHaveBeenCalledTimes(1);
  });

  it("silently discards honeypot submissions before Stripe or the database", async () => {
    const response = await POST(
      makeRequest({ ...validBody, website: "https://spam.invalid" }),
    );

    expect(response.status).toBe(201);
    expect(stripeMock.checkout.sessions.retrieve).not.toHaveBeenCalled();
    expect(prismaMock.supportTicket.create).not.toHaveBeenCalled();
  });
});
