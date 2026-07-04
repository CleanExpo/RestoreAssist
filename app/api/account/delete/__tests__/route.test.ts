/**
 * account-deletion-retention — POST /api/account/delete must NOT destroy the
 * statutory financial/compliance records the Privacy Policy (/privacy#retention)
 * promises to retain.
 *
 * Contract:
 *   - The account holder's User row (and therefore their PII) is deleted.
 *   - Invoice / Report / Estimate / RestorationDocument / CreditNote /
 *     InvoicePayment rows are NOT cascade-destroyed — they are reassigned onto
 *     the dedicated PII-free system retention owner so they survive account
 *     closure, anonymised (no longer linked to the deleted account holder).
 *   - The reassign-then-delete is a single all-or-nothing transaction: if the
 *     delete fails, the reassignment does not commit on its own and no success
 *     response is returned.
 *
 * next-auth, auth, rate-limiter, idempotency, stripe, csrf, security-audit and
 * Prisma are mocked. api-errors is used for real (pure response builders).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const RETENTION_OWNER_USER_ID = "system-retention-owner";

/**
 * The complete set of user-owned, onDelete: Cascade, statutory
 * financial/compliance relations that MUST be reassigned (not destroyed) on
 * account deletion. Enumerated here so that a mutant which drops any single
 * reassignment — or a future statutory table added without protection — is
 * caught structurally, not just for the three the original fix hard-coded.
 */
const STATUTORY_REASSIGNED_DELEGATES = [
  "invoice",
  "report",
  "estimate",
  "restorationDocument",
  "creditNote",
  "invoicePayment",
] as const;

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (
      req: NextRequest,
      _scope: string,
      handler: (raw: string) => Promise<Response>,
    ) => handler(await req.text()),
  ),
}));
vi.mock("@/lib/security-audit", () => ({
  logSecurityEvent: vi.fn(async () => undefined),
  extractRequestContext: vi.fn(() => ({ ipAddress: "127.0.0.1" })),
}));

const stripeMock = vi.hoisted(() => ({
  subscriptions: { cancel: vi.fn(async () => undefined) },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

const prismaMock = vi.hoisted(() => {
  const mock: {
    user: { findUnique: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    invoice: { updateMany: ReturnType<typeof vi.fn> };
    report: { updateMany: ReturnType<typeof vi.fn> };
    estimate: { updateMany: ReturnType<typeof vi.fn> };
    restorationDocument: { updateMany: ReturnType<typeof vi.fn> };
    creditNote: { updateMany: ReturnType<typeof vi.fn> };
    invoicePayment: { updateMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  } = {
    user: { findUnique: vi.fn(), delete: vi.fn() },
    invoice: { updateMany: vi.fn() },
    report: { updateMany: vi.fn() },
    estimate: { updateMany: vi.fn() },
    restorationDocument: { updateMany: vi.fn() },
    creditNote: { updateMany: vi.fn() },
    invoicePayment: { updateMany: vi.fn() },
    // Interactive transaction: run the callback with the same delegate set as
    // the transactional client so tx.* calls are observable on the mock.
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mock)),
  };
  return mock;
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "../route";
import { getServerSession } from "next-auth";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/account/delete", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const CONFIRMATION = { confirmation: "DELETE MY ACCOUNT" };

// Typed accessor for the updateMany mock of a statutory delegate, so the
// enumerated tests below can assert over the whole set without `any`.
const updateManyOf = (delegate: (typeof STATUTORY_REASSIGNED_DELEGATES)[number]) =>
  (prismaMock as Record<string, { updateMany: ReturnType<typeof vi.fn> }>)[
    delegate
  ].updateMany;

describe("POST /api/account/delete — statutory-record retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com", name: "Owner" },
    } as never);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      stripeCustomerId: null,
      subscriptionId: null,
    } as never);
    prismaMock.invoice.updateMany.mockResolvedValue({ count: 2 } as never);
    prismaMock.report.updateMany.mockResolvedValue({ count: 3 } as never);
    prismaMock.estimate.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.restorationDocument.updateMany.mockResolvedValue({
      count: 4,
    } as never);
    prismaMock.creditNote.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.invoicePayment.updateMany.mockResolvedValue({
      count: 5,
    } as never);
    prismaMock.user.delete.mockResolvedValue({ id: "user-1" } as never);
    prismaMock.$transaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => cb(prismaMock),
    );
  });

  it("deletes the account holder's User row (erases their PII)", async () => {
    const res = await POST(makeRequest(CONFIRMATION));
    expect(res.status).toBe(200);
    expect(prismaMock.user.delete).toHaveBeenCalledWith({
      where: { id: "user-1" },
    });
  });

  // Enumerated so dropping ANY single reassignment (a surviving mutant) fails
  // here — including RestorationDocument, CreditNote and InvoicePayment, the
  // statutory tables the original three-name fix left cascade-destroyed.
  it.each(STATUTORY_REASSIGNED_DELEGATES)(
    "reassigns %s to the retention owner instead of destroying it",
    async (delegate) => {
      const res = await POST(makeRequest(CONFIRMATION));
      expect(res.status).toBe(200);
      expect(updateManyOf(delegate)).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { userId: RETENTION_OWNER_USER_ID },
      });
    },
  );

  it("leaves no user-owned statutory financial relation un-reassigned (full-set guard)", async () => {
    await POST(makeRequest(CONFIRMATION));
    for (const delegate of STATUTORY_REASSIGNED_DELEGATES) {
      expect(
        updateManyOf(delegate),
        `${delegate}.updateMany must run so the ${delegate} rows are retained, not cascade-destroyed`,
      ).toHaveBeenCalledTimes(1);
    }
  });

  it.each(STATUTORY_REASSIGNED_DELEGATES)(
    "reassigns %s BEFORE deleting the user (cascade has nothing left to destroy)",
    async (delegate) => {
      await POST(makeRequest(CONFIRMATION));
      const order = (fn: ReturnType<typeof vi.fn>) =>
        fn.mock.invocationCallOrder[0];
      expect(order(updateManyOf(delegate))).toBeLessThan(
        order(prismaMock.user.delete),
      );
    },
  );

  it("performs the reassign + delete in a single all-or-nothing transaction", async () => {
    await POST(makeRequest(CONFIRMATION));
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // Every mutation runs through the transactional client, not the bare one.
    for (const delegate of STATUTORY_REASSIGNED_DELEGATES) {
      expect(updateManyOf(delegate)).toHaveBeenCalledTimes(1);
    }
    expect(prismaMock.user.delete).toHaveBeenCalledTimes(1);
  });

  it("does not report success (and lets the transaction roll back) when the delete fails", async () => {
    prismaMock.user.delete.mockRejectedValue(new Error("boom") as never);
    const res = await POST(makeRequest(CONFIRMATION));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { success?: boolean };
    expect(json.success).not.toBe(true);
  });

  it("rejects a missing/incorrect confirmation phrase without touching any records", async () => {
    const res = await POST(makeRequest({ confirmation: "nope" }));
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.invoice.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });
});
