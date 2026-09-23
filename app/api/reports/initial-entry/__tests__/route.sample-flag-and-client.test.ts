/**
 * RA-7711 — POST /api/reports/initial-entry must not take its sample marking
 * from the browser. A body flag (`quickFillSample`) let any caller store a
 * real job as a hidden sample while still spending a credit and the one-shot
 * activation event. The route ignores it: nothing a client sends marks a
 * submission, its client or its report as a sample.
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

describe("POST /api/reports/initial-entry ignores a browser sample flag (RA-7711)", () => {
  it("stores a submission sent with quickFillSample: true as a normal job", async () => {
    const res = await POST(req({ ...QUICK_FILL_BODY, quickFillSample: true }));
    expect(res.status).toBe(200);

    expect(clientCreate).toHaveBeenCalledTimes(1);
    expect(clientCreate.mock.calls[0][0].data).not.toHaveProperty("isSample");
    expect(clientCreate.mock.calls[0][0].data.email).toBe(
      "john.smith@abcco.com.au",
    );
    expect(reportCreate.mock.calls[0][0].data).not.toHaveProperty("isSample");
  });

  it("leaves a normal submission unmarked", async () => {
    await POST(req(QUICK_FILL_BODY));
    expect(clientCreate.mock.calls[0][0].data).not.toHaveProperty("isSample");
    expect(reportCreate.mock.calls[0][0].data).not.toHaveProperty("isSample");
  });
});
