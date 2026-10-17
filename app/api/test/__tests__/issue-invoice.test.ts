import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const invoiceUpdateMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { updateMany: (...a: unknown[]) => invoiceUpdateMany(...a) },
  },
}));

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test/v1-reference-claim/issue-invoice", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function load() {
  vi.resetModules();
  return (await import("../v1-reference-claim/issue-invoice/route")).POST;
}

beforeEach(() => {
  getServerSession.mockReset();
  invoiceUpdateMany.mockReset();
  vi.unstubAllEnvs();
});

describe("POST /api/test/v1-reference-claim/issue-invoice", () => {
  it("is a 404 and touches nothing when test helpers are off", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "");
    const res = await (await load())(makeReq({ invoiceId: "inv_1" }));
    expect(res.status).toBe(404);
    expect(invoiceUpdateMany).not.toHaveBeenCalled();
  });

  it("is a 404 on a Vercel production deploy without the explicit opt-in", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    const res = await (await load())(makeReq({ invoiceId: "inv_1" }));
    expect(res.status).toBe(404);
    expect(invoiceUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    getServerSession.mockResolvedValueOnce(null);
    const res = await (await load())(makeReq({ invoiceId: "inv_1" }));
    expect(res.status).toBe(401);
    expect(invoiceUpdateMany).not.toHaveBeenCalled();
  });

  it("moves only the caller's own DRAFT invoice to SENT", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    getServerSession.mockResolvedValueOnce({ user: { id: "u_owner" } });
    invoiceUpdateMany.mockResolvedValueOnce({ count: 1 });
    const res = await (await load())(makeReq({ invoiceId: "inv_1" }));
    expect(res.status).toBe(200);
    expect(invoiceUpdateMany).toHaveBeenCalledWith({
      where: { id: "inv_1", userId: "u_owner", status: "DRAFT" },
      data: { status: "SENT", sentDate: expect.any(Date) },
    });
  });

  it("is a 404 when no own draft matched (another tenant's, or already sent)", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    getServerSession.mockResolvedValueOnce({ user: { id: "u_owner" } });
    invoiceUpdateMany.mockResolvedValueOnce({ count: 0 });
    const res = await (await load())(makeReq({ invoiceId: "inv_other" }));
    expect(res.status).toBe(404);
  });
});
