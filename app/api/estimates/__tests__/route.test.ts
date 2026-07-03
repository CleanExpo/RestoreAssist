/**
 * RA-6961 — POST /api/estimates cross-tenant scopeId regression.
 *
 * Before the fix, the existing-estimate lookup was
 * `findFirst({ where: { OR: [{ reportId }, { scopeId }] } })` with no
 * userId scoping. A caller who owns reportId R1 but supplies a *foreign*
 * scopeId (belonging to another tenant's estimate) would have that OR
 * clause resolve to the foreign estimate, which the route then updates —
 * overwriting another tenant's data and re-parenting it to the caller's
 * own report.
 *
 * The fix adds `userId` at the top level of the `where`, so the OR only
 * ever matches rows already owned by the caller. A foreign scopeId can no
 * longer resolve to someone else's estimate: the lookup returns null and
 * the route falls through to creating a brand-new estimate scoped to the
 * caller instead of mutating the foreign one.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const withIdempotency = vi.fn();
const reportFindFirst = vi.fn();
const estimateFindFirst = vi.fn();
const estimateCreate = vi.fn();
const estimateUpdate = vi.fn();
const estimateLineItemFindMany = vi.fn();
const prismaTransaction = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (...args: unknown[]) => withIdempotency(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findFirst: (...args: unknown[]) => reportFindFirst(...args),
    },
    estimate: {
      findFirst: (...args: unknown[]) => estimateFindFirst(...args),
      create: (...args: unknown[]) => estimateCreate(...args),
      update: (...args: unknown[]) => estimateUpdate(...args),
    },
    estimateLineItem: {
      findMany: (...args: unknown[]) => estimateLineItemFindMany(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      prismaTransaction(fn),
  },
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/estimates", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  withIdempotency.mockReset();
  reportFindFirst.mockReset();
  estimateFindFirst.mockReset();
  estimateCreate.mockReset();
  estimateUpdate.mockReset();
  estimateLineItemFindMany.mockReset();
  prismaTransaction.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  applyRateLimit.mockResolvedValue(null);
  withIdempotency.mockImplementation(
    async (
      req: Request,
      _userId: string,
      fn: (rawBody: string) => Promise<Response>,
    ) => fn(await req.text()),
  );
  // Own report — passes the tenancy check at the top of the handler.
  reportFindFirst.mockResolvedValue({ id: "report-own" });
});

describe("POST /api/estimates", () => {
  it("RA-6961: a foreign scopeId does not resolve to another tenant's estimate", async () => {
    // No estimate owned by this caller matches reportId or scopeId — the
    // foreign estimate that actually owns "scope-foreign" is excluded by
    // the userId filter, so the lookup must return null.
    estimateFindFirst.mockResolvedValueOnce(null);
    estimateCreate.mockResolvedValueOnce({
      id: "estimate-new",
      reportId: "report-own",
      scopeId: "scope-foreign",
      status: "DRAFT",
      version: 1,
      lineItems: [],
    });

    const res = await POST(
      makeRequest({ reportId: "report-own", scopeId: "scope-foreign" }),
    );

    expect(res.status).toBe(200);
    // The load-bearing assertion: userId must scope the OR lookup, not
    // just be checked afterwards — otherwise a foreign row could still
    // be selected and this test would need to fail below.
    expect(estimateFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          OR: [{ reportId: "report-own" }, { scopeId: "scope-foreign" }],
        },
      }),
    );
    // Nothing on any existing (foreign) estimate was touched — the route
    // took the create-new-estimate branch, never calling estimate.update.
    expect(estimateUpdate).not.toHaveBeenCalled();
    expect(prismaTransaction).not.toHaveBeenCalled();
    expect(estimateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: "report-own",
          userId: "user-1",
          createdBy: "user-1",
        }),
      }),
    );
  });

  it("404s before ever touching the estimate table when the report isn't the caller's", async () => {
    reportFindFirst.mockResolvedValueOnce(null);

    const res = await POST(
      makeRequest({ reportId: "report-foreign", scopeId: "scope-foreign" }),
    );

    expect(res.status).toBe(404);
    expect(estimateFindFirst).not.toHaveBeenCalled();
    expect(estimateCreate).not.toHaveBeenCalled();
  });
});
