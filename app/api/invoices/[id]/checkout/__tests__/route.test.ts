import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * P1-MNY-00 — Pay Online is contained until firms are paid into their own
 * Stripe account (P1-MNY-01). The checkout route created sessions on
 * RestoreAssist's own account, so it must refuse and never reach Stripe.
 * Sabotage: remove the refusal — the session create is called and the
 * response is 200.
 */

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const { sessionsCreate } = vi.hoisted(() => ({ sessionsCreate: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  stripe: { checkout: { sessions: { create: sessionsCreate } } },
}));

vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (_req: unknown, _userId: string, fn: () => unknown) => fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findUnique: vi.fn() },
    invoiceAuditLog: { create: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  invoice: { findUnique: ReturnType<typeof vi.fn> };
};

function call() {
  return POST(
    new NextRequest("http://localhost/api/invoices/inv_1/checkout", { method: "POST" }),
    { params: Promise.resolve({ id: "inv_1" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  sessionsCreate.mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.test/cs_test" });
  // A sent, unpaid invoice — exactly the case that used to open Stripe Checkout.
  p.invoice.findUnique.mockResolvedValue({
    id: "inv_1",
    userId: "u_1",
    status: "SENT",
    amountDue: 11000,
    currency: "AUD",
    invoiceNumber: "INV-0001",
    customerName: "Mock Customer",
    customerEmail: "mock@example.com",
    lineItems: [],
  });
});

describe("P1-MNY-00 invoice checkout is contained", () => {
  it("refuses a sent, unpaid invoice with a clear message", async () => {
    const res = await call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("FEATURE_UNAVAILABLE");
    expect(body.error.message).toMatch(/online payment/i);
  });

  it("never creates a Stripe checkout session", async () => {
    await call();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("still requires sign-in", async () => {
    mockSession.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});
