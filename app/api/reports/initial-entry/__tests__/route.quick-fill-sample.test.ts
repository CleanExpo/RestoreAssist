/**
 * RA-7711 (A2) — a quick-filled submission must not pollute the account.
 *
 * Observed live 2026-09-23: each Quick Fill + submit created a real client
 * ("ABC Co.", john.smith@abcco.com.au) and a DRAFT report at
 * "123 Main Street, Suburb, NSW 2000", and the dashboard counted them.
 *
 * With `quickFillSample: true` the route must write `isSample: true` on the
 * client and the report it creates, and must never find-and-reuse (or
 * update) a real client. Without the flag, behaviour is unchanged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const userFindUnique = vi.fn();
const clientFindFirst = vi.fn();
const clientCreate = vi.fn();
const clientUpdate = vi.fn();
const reportCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    client: {
      findFirst: (...a: unknown[]) => clientFindFirst(...a),
      create: (...a: unknown[]) => clientCreate(...a),
      update: (...a: unknown[]) => clientUpdate(...a),
    },
    report: { create: (...a: unknown[]) => reportCreate(...a) },
  },
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: { text: () => Promise<string> },
    _userId: string,
    cb: (raw: string) => Promise<unknown>,
  ) => cb(await request.text()),
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_req: unknown, opts: { message: string; status: number }) =>
    new Response(JSON.stringify({ error: opts.message }), {
      status: opts.status,
    }),
  fromException: (_req: unknown, err: unknown) =>
    new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}));
vi.mock("@/lib/analytics/first-report-saved", () => ({
  recordFirstReportSaved: async () => undefined,
}));
vi.mock("@/lib/report-limits", () => ({
  canCreateReport: async () => ({ allowed: true }),
  deductCreditsAndTrackUsage: async () => undefined,
}));

import { POST } from "../route";

const QUICK_FILL_BODY = {
  clientName: "ABC Co.",
  clientContactDetails: "John Smith - 0401 987 654 - john.smith@abcco.com.au",
  propertyAddress: "123 Main Street, Suburb, NSW 2000",
  propertyPostcode: "2000",
  technicianFieldReport: "Attended site.",
};

function req(body: unknown) {
  return new NextRequest("http://localhost/api/reports/initial-entry", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "u1" } });
  userFindUnique.mockResolvedValue({ id: "u1", subscriptionStatus: "TRIAL" });
  clientFindFirst.mockResolvedValue(null);
  clientCreate.mockResolvedValue({ id: "c-new" });
  reportCreate.mockResolvedValue({ id: "r-new" });
});

describe("POST /api/reports/initial-entry — Quick Fill samples (RA-7711)", () => {
  it("marks the client and report it creates as samples", async () => {
    const res = await POST(req({ ...QUICK_FILL_BODY, quickFillSample: true }));
    expect(res.status).toBe(200);

    expect(clientCreate).toHaveBeenCalledTimes(1);
    expect(clientCreate.mock.calls[0][0].data.isSample).toBe(true);
    expect(reportCreate.mock.calls[0][0].data.isSample).toBe(true);
  });

  it("never reuses or updates a real client for a sample submission", async () => {
    // A real client with the same name exists on the account.
    clientFindFirst.mockImplementation(async (args: { where: { isSample?: boolean } }) =>
      args.where.isSample === true ? null : { id: "c-real", email: "real@x.au" },
    );

    await POST(req({ ...QUICK_FILL_BODY, quickFillSample: true }));

    expect(clientUpdate).not.toHaveBeenCalled();
    for (const [args] of clientFindFirst.mock.calls) {
      expect(args.where.isSample).toBe(true);
    }
    expect(reportCreate.mock.calls[0][0].data.clientId).not.toBe("c-real");
  });

  it("leaves a normal submission unmarked", async () => {
    await POST(req(QUICK_FILL_BODY));
    expect(clientCreate.mock.calls[0][0].data.isSample).not.toBe(true);
    expect(reportCreate.mock.calls[0][0].data.isSample).not.toBe(true);
  });
});
