/**
 * C1 — the technician (Role USER) must not create money records.
 *
 * Invoices, credit notes, recurring templates and variation invoices are the
 * firm's receivables. Creating one is a money action, so the four POST
 * handlers re-read the caller's role from the DATABASE (the JWT carries a role
 * for up to 90 days and a demotion does not rewrite it) and admit only a role
 * that positively holds the capability: ADMIN or MANAGER. USER gets 403 in the
 * repo's apiError envelope before the body is parsed.
 *
 * The pass cases assert the exact validation status an empty body produces in
 * each handler, never "not 403": an unmocked call that throws a 500 is also
 * "not 403", and a control that cannot tell the two apart cannot fail.
 *
 * Linking a report or estimate to an invoice puts that record's money behind
 * the invoice, so `canLinkRecord` resolves the report/estimate branch through
 * the FINANCIAL reach (the organisation widening stops at MANAGER, D-023 /
 * RA-7771), not the plain read reach.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getServerSession, userFindUnique, reportFindFirst, estimateFindFirst } =
  vi.hoisted(() => ({
    getServerSession: vi.fn(),
    userFindUnique: vi.fn(),
    reportFindFirst: vi.fn(),
    estimateFindFirst: vi.fn(),
  }));

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/organization-credits", () => ({
  getMembershipStart: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/gst/resolve-user-gst", () => ({
  resolveUserGstTreatment: vi.fn().mockResolvedValue({
    country: "AU",
    rate: 0.1,
    ratePercent: 10,
    currency: "AUD",
    percentLabel: "10%",
    xeroTaxType: "OUTPUT",
    myobTaxCode: "GST",
    qboTaxRateName: "GST",
  }),
}));
// No Idempotency-Key header is sent; run the handler on the raw body.
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    req: NextRequest,
    _userId: string,
    handler: (raw: string) => Promise<Response>,
  ) => handler(await req.text()),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: userFindUnique, findMany: vi.fn().mockResolvedValue([]) },
    report: { findFirst: reportFindFirst },
    estimate: { findFirst: estimateFindFirst },
    invoice: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(),
  },
}));

import { POST as createInvoice } from "../route";
import { POST as createCreditNote } from "../credit-notes/route";
import { POST as createRecurring } from "../recurring/route";
import { POST as createVariation } from "../[id]/variations/route";
import { canLinkRecord } from "@/lib/auth/assert-tenancy";

type Role = "USER" | "MANAGER" | "ADMIN";

function dbUser(role: Role) {
  return {
    id: "u_1",
    role,
    organizationId: "org_1",
    email: "tech@example.com",
    organizationLeftAt: null,
    organizationLeftId: null,
  };
}

const post = (url: string) =>
  new NextRequest(url, {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  });

const HANDLERS: {
  name: string;
  call: () => Promise<Response>;
  /** Status the handler's own validation gives an empty body. */
  emptyBodyStatus: number;
}[] = [
  {
    name: "POST /api/invoices",
    call: () => createInvoice(post("http://localhost/api/invoices")),
    emptyBodyStatus: 400,
  },
  {
    name: "POST /api/invoices/credit-notes",
    call: () => createCreditNote(post("http://localhost/api/invoices/credit-notes")),
    emptyBodyStatus: 422,
  },
  {
    name: "POST /api/invoices/recurring",
    call: () => createRecurring(post("http://localhost/api/invoices/recurring")),
    emptyBodyStatus: 422,
  },
  {
    name: "POST /api/invoices/[id]/variations",
    call: () =>
      createVariation(post("http://localhost/api/invoices/inv_1/variations"), {
        params: Promise.resolve({ id: "inv_1" }),
      }),
    emptyBodyStatus: 400,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("C1: money POSTs admit only ADMIN or MANAGER, read from the database", () => {
  for (const h of HANDLERS) {
    it(`${h.name}: USER gets 403 in the apiError envelope`, async () => {
      getServerSession.mockResolvedValue({ user: { id: "u_1", role: "USER" } });
      userFindUnique.mockResolvedValue(dbUser("USER"));

      const res = await h.call();

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
      expect(typeof body.error.message).toBe("string");
    });

    it(`${h.name}: a stale ADMIN claim is refused when the database says USER`, async () => {
      getServerSession.mockResolvedValue({ user: { id: "u_1", role: "ADMIN" } });
      userFindUnique.mockResolvedValue(dbUser("USER"));

      const res = await h.call();

      expect(res.status).toBe(403);
    });

    it(`${h.name}: a missing user row is refused`, async () => {
      getServerSession.mockResolvedValue({ user: { id: "u_1", role: "ADMIN" } });
      userFindUnique.mockResolvedValue(null);

      const res = await h.call();

      expect(res.status).toBe(403);
    });

    for (const role of ["ADMIN", "MANAGER"] as const) {
      it(`${h.name}: ${role} passes the gate and reaches the handler's validation`, async () => {
        getServerSession.mockResolvedValue({ user: { id: "u_1", role } });
        userFindUnique.mockResolvedValue(dbUser(role));

        const res = await h.call();

        expect(res.status).toBe(h.emptyBodyStatus);
        const body = await res.json();
        expect(body.error.code).toBe("VALIDATION");
      });
    }
  }
});

describe("C1: linking a report or estimate uses the financial reach", () => {
  const userSession = { user: { id: "u_1", role: "USER" } };

  it("a USER colleague's report link is resolved without the organisation clause", async () => {
    userFindUnique.mockResolvedValue(dbUser("USER"));
    reportFindFirst.mockResolvedValue(null);

    await canLinkRecord(userSession, "report", "rep_1");

    expect(reportFindFirst).toHaveBeenCalledTimes(1);
    const where = JSON.stringify(reportFindFirst.mock.calls[0][0].where);
    expect(where).toContain('"userId":"u_1"');
    expect(where).not.toContain("organizationId");
  });

  it("a USER colleague's estimate link is resolved without the organisation clause", async () => {
    userFindUnique.mockResolvedValue(dbUser("USER"));
    estimateFindFirst.mockResolvedValue(null);

    await canLinkRecord(userSession, "estimate", "est_1");

    expect(estimateFindFirst).toHaveBeenCalledTimes(1);
    const where = JSON.stringify(estimateFindFirst.mock.calls[0][0].where);
    expect(where).toContain('"userId":"u_1"');
    expect(where).not.toContain("organizationId");
  });

  it("positive control: a MANAGER's report link does reach the organisation", async () => {
    userFindUnique.mockResolvedValue(dbUser("MANAGER"));
    reportFindFirst.mockResolvedValue({ id: "rep_1" });

    const ok = await canLinkRecord(
      { user: { id: "u_1", role: "MANAGER" } },
      "report",
      "rep_1",
    );

    expect(ok).toBe(true);
    const where = JSON.stringify(reportFindFirst.mock.calls[0][0].where);
    expect(where).toContain('"organizationId":"org_1"');
  });
});
