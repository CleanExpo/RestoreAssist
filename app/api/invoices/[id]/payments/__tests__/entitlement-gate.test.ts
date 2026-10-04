/**
 * RA-6920 B4 — PAYMENTS add-on gate on manual/bank-deposit payment recording.
 *
 * The invoice payments route is gated by requireAddon(PAYMENTS): a workspace
 * with an ACTIVE FeatureEntitlement is allowed through; everyone else gets a
 * fail-closed 402 the client turns into the upgrade CTA. requireAddon is
 * mocked here so the test runs without a database. Grandfathering of
 * pre-existing manual payers is covered separately by
 * scripts/__tests__/grandfather-payments-addon.test.ts.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const invoiceFindUnique = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const inviteFindFirst = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (
      req: Request,
      _userId: string,
      fn: (raw: string) => Promise<Response>,
    ) => fn(await req.text()),
  ),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findUnique: invoiceFindUnique },
    user: { findUnique: userFindUnique },
    userInvite: { findFirst: inviteFindFirst },
    $transaction: transaction,
  },
}));
vi.mock("@/lib/entitlements", () => ({
  requireAddon: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { requireAddon } from "@/lib/entitlements";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockRequireAddon = requireAddon as unknown as ReturnType<typeof vi.fn>;
const mockFindUnique = invoiceFindUnique;

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_test" } });
  transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ invoice: { findUnique: invoiceFindUnique } }),
  );
});

function makePost(body: object): NextRequest {
  return new NextRequest("http://localhost/api/invoices/inv_1/payments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: "inv_1" }) };
}

describe("RA-6920 B4 — PAYMENTS add-on gate", () => {
  it("returns 402 when the workspace is not entitled to the add-on", async () => {
    mockRequireAddon.mockResolvedValue({
      allowed: false,
      reason: "NOT_ENTITLED",
      sku: "PAYMENTS",
      response: NextResponse.json(
        { error: "add-on required", code: "ADDON_REQUIRED" },
        { status: 402 },
      ),
    });

    const res = await POST(
      makePost({ amount: 1000, paymentMethod: "BANK_TRANSFER" }),
      makeParams(),
    );

    expect(res.status).toBe(402);
    expect(mockRequireAddon).toHaveBeenCalledWith("u_test", "PAYMENTS");
    // The invoice lookup must never be reached for a gated request.
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 401 before checking the add-on when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await POST(
      makePost({ amount: 1000, paymentMethod: "BANK_TRANSFER" }),
      makeParams(),
    );

    expect(res.status).toBe(401);
    expect(mockRequireAddon).not.toHaveBeenCalled();
  });

  it("passes the gate for an entitled workspace and proceeds to the handler", async () => {
    mockRequireAddon.mockResolvedValue({
      allowed: true,
      sku: "PAYMENTS",
      workspaceId: "ws_1",
    });
    // Invoice not found → the handler proceeds past the gate and returns its
    // own 404, proving the 402 gate was cleared.
    mockFindUnique.mockResolvedValue(null);

    const res = await POST(
      makePost({ amount: 1000, paymentMethod: "BANK_TRANSFER" }),
      makeParams(),
    );

    expect(res.status).toBe(404);
    expect(mockRequireAddon).toHaveBeenCalledWith("u_test", "PAYMENTS");
  });
});

describe("RA-7893 — PAYMENTS on an invoice from the technician's previous organisation", () => {
  it("refuses to record a payment on org B's add-on for an invoice created in org A before the move", async () => {
    // u_test created inv_1 on 1 June in org A, then accepted an invite into
    // org B on 1 July. The caller-keyed gate passes on org B's PAYMENTS.
    mockRequireAddon.mockResolvedValue({
      allowed: true,
      sku: "PAYMENTS",
      workspaceId: "ws_b",
    });
    mockFindUnique.mockResolvedValue({
      userId: "u_test",
      createdAt: new Date("2026-06-01T00:00:00Z"),
    });
    userFindUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where.id === "u_test"
          ? {
              id: "u_test",
              role: "USER",
              organizationId: "org_b",
              organization: { ownerId: "owner_b" },
              email: "u_test@example.com",
            }
          : null,
    );
    inviteFindFirst.mockResolvedValue({
      usedAt: new Date("2026-07-01T00:00:00Z"),
    });

    const res = await POST(
      makePost({ amount: 1000, paymentMethod: "BANK_TRANSFER" }),
      makeParams(),
    );

    expect(transaction).not.toHaveBeenCalled();
    expect(res.status).toBe(402);
  });
});
