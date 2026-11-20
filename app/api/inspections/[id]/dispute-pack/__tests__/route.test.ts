import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";

/**
 * RA-8421: issuing the invoice moves a job to IN_BILLING, and a dispute can only
 * be raised after that (INVOICE_ISSUED -> DISPUTED). The pack must be available
 * on invoiced and closed jobs, and still refused before submission.
 */

const mocks = vi.hoisted(() => ({
  inspectionFindUnique: vi.fn(),
  generateDisputePack: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: (...args: unknown[]) => mocks.inspectionFindUnique(...args),
    },
  },
}));
vi.mock("@/lib/dispute-pack", () => ({
  generateDisputePack: (...args: unknown[]) =>
    mocks.generateDisputePack(...args),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (
    _request: NextRequest,
    _userId: string,
    fn: () => Promise<Response>,
  ) => fn(),
}));

import { POST } from "../route";

function call() {
  return POST(
    new NextRequest("http://localhost/api/inspections/insp-1/dispute-pack", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "insp-1" }) },
  );
}

function jobWithStatus(status: string) {
  mocks.inspectionFindUnique.mockResolvedValue({
    id: "insp-1",
    inspectionNumber: "NIR-1",
    status,
    userId: "owner-1",
  });
}

describe("POST /api/inspections/[id]/dispute-pack status gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "owner-1" },
    } as Awaited<ReturnType<typeof getServerSession>>);
    mocks.generateDisputePack.mockResolvedValue(
      new Uint8Array([37, 80, 68, 70]),
    );
  });

  it.each(["IN_BILLING", "CLOSED", "SUBMITTED", "COMPLETED"])(
    "returns the PDF for a %s job",
    async (status) => {
      jobWithStatus(status);
      const res = await call();
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      expect(mocks.generateDisputePack).toHaveBeenCalledOnce();
    },
  );

  it("refuses a DRAFT job and names the allowed states", async () => {
    jobWithStatus("DRAFT");
    const res = await call();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("IN_BILLING");
    expect(mocks.generateDisputePack).not.toHaveBeenCalled();
  });
});
