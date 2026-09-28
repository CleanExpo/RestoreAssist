import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const inspectionUpsert = vi.fn();
const reportUpsert = vi.fn();
const invoiceUpsert = vi.fn();
const claimProgressUpsert = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { upsert: (...a: unknown[]) => inspectionUpsert(...a) },
    report: { upsert: (...a: unknown[]) => reportUpsert(...a) },
    invoice: { upsert: (...a: unknown[]) => invoiceUpsert(...a) },
    claimProgress: { upsert: (...a: unknown[]) => claimProgressUpsert(...a) },
  },
}));

const URL = "http://localhost/api/test/seed-inspection";

function makeReq(body: unknown): NextRequest {
  return new NextRequest(URL, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** A raw body, sent as-is. makeReq would stringify it into valid JSON. */
function rawReq(body: string): NextRequest {
  return new NextRequest(
    new Request(URL, {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    }),
  );
}

/** Every case sets all three guard keys explicitly. "" means unset. */
function env(allow: string, vercelEnv: string, prodOptIn: string) {
  vi.stubEnv("ALLOW_TEST_HELPERS", allow);
  vi.stubEnv("VERCEL_ENV", vercelEnv);
  vi.stubEnv("ALLOW_TEST_HELPERS_IN_PROD_ENV", prodOptIn);
}

function expectNoUpserts() {
  expect(inspectionUpsert).not.toHaveBeenCalled();
  expect(reportUpsert).not.toHaveBeenCalled();
  expect(invoiceUpsert).not.toHaveBeenCalled();
  expect(claimProgressUpsert).not.toHaveBeenCalled();
}

async function loadPOST() {
  vi.resetModules();
  const { POST } = await import("../seed-inspection/route");
  return POST;
}

beforeEach(() => {
  getServerSession.mockReset();
  inspectionUpsert.mockReset();
  reportUpsert.mockReset();
  invoiceUpsert.mockReset();
  claimProgressUpsert.mockReset();
  // Upserts answer by default, so a write that should not happen is caught by
  // a status or not-called assertion, not by a TypeError on undefined.
  inspectionUpsert.mockResolvedValue({ id: "test-inspection" });
  reportUpsert.mockResolvedValue({ id: "test-inspection-report" });
  invoiceUpsert.mockResolvedValue({ id: "test-inspection-invoice" });
  claimProgressUpsert.mockResolvedValue({ id: "test-inspection-progress" });
  // Every case starts unblocked with all three keys set; guard cases override.
  env("true", "", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/test/seed-inspection", () => {
  describe("B6: blocked environment answers 404 before session or body", () => {
    it("B6(i) ALLOW_TEST_HELPERS=true, VERCEL_ENV=production, no opt-in → 404", async () => {
      env("true", "production", "");
      getServerSession.mockResolvedValue({ user: { id: "u_test" } });
      const POST = await loadPOST();
      const res = await POST(makeReq({}));
      expect(res.status).toBe(404);
      expect(getServerSession).not.toHaveBeenCalled();
      expectNoUpserts();
    });

    it("B6(ii) both keys unset → 404", async () => {
      env("", "", "");
      getServerSession.mockResolvedValue({ user: { id: "u_test" } });
      const POST = await loadPOST();
      const res = await POST(makeReq({}));
      expect(res.status).toBe(404);
      expect(getServerSession).not.toHaveBeenCalled();
      expectNoUpserts();
    });

    it("B6 guard runs before the body parse: blocked + malformed body → 404", async () => {
      env("", "", "");
      const POST = await loadPOST();
      const res = await POST(rawReq("{not json"));
      expect(res.status).toBe(404);
      expectNoUpserts();
    });

    it("B6 control: production with the opt-in is unblocked and upserts", async () => {
      env("true", "production", "true");
      getServerSession.mockResolvedValueOnce({ user: { id: "u_test" } });
      inspectionUpsert.mockResolvedValueOnce({ id: "test-inspection" });
      const POST = await loadPOST();
      const res = await POST(makeReq({}));
      expect(res.status).toBe(200);
      expect(inspectionUpsert).toHaveBeenCalledTimes(1);
    });
  });

  describe("B4: malformed or non-object body answers 400 with zero writes", () => {
    it.each([
      ["malformed JSON", "{not json"],
      ["empty body", ""],
      ["null", "null"],
      ["array", "[]"],
      ["number", "5"],
    ])("B4 %s → 400", async (_l, raw) => {
      getServerSession.mockResolvedValue({ user: { id: "u_test" } });
      const POST = await loadPOST();
      const res = await POST(rawReq(raw));
      expect(res.status).toBe(400);
      expectNoUpserts();
    });

    it("B4 order: signed out + malformed body → 401 (session before parse)", async () => {
      getServerSession.mockResolvedValue(null);
      const POST = await loadPOST();
      const res = await POST(rawReq("{not json"));
      expect(res.status).toBe(401);
      expectNoUpserts();
    });

    it("B4 control: a valid raw body in the same environment upserts", async () => {
      getServerSession.mockResolvedValueOnce({ user: { id: "u_test" } });
      inspectionUpsert.mockResolvedValueOnce({ id: "test-inspection" });
      const POST = await loadPOST();
      const res = await POST(rawReq("{}"));
      expect(res.status).toBe(200);
      expect(inspectionUpsert).toHaveBeenCalledTimes(1);
    });

    it("B4c unknown key is accepted and ignored → 200 (deliberate asymmetry with seed-org)", async () => {
      getServerSession.mockResolvedValueOnce({ user: { id: "u_test" } });
      inspectionUpsert.mockResolvedValueOnce({ id: "test-inspection" });
      const POST = await loadPOST();
      const res = await POST(makeReq({ submittable: true }));
      expect(res.status).toBe(200);
      expect(inspectionUpsert).toHaveBeenCalledTimes(1);
      const call = inspectionUpsert.mock.calls[0][0];
      expect(call.create).not.toHaveProperty("submittable");
      expect(call.update).not.toHaveProperty("submittable");
    });
  });

  it("B7 returns 200 happy path with default id + status COMPLETED", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_test" } });
    inspectionUpsert.mockResolvedValueOnce({ id: "test-inspection" });

    const POST = await loadPOST();
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inspectionId: "test-inspection" });

    expect(inspectionUpsert).toHaveBeenCalledTimes(1);
    expect(inspectionUpsert).toHaveBeenCalledWith({
      where: { id: "test-inspection" },
      create: expect.objectContaining({
        id: "test-inspection",
        inspectionNumber: "TEST-test-inspection",
        status: "COMPLETED",
        userId: "u_test",
        propertyAddress: expect.any(String),
        propertyPostcode: expect.any(String),
      }),
      update: { status: "COMPLETED" },
      select: { id: true },
    });
  });

  it("uses custom inspectionId when provided", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_test" } });
    inspectionUpsert.mockResolvedValueOnce({ id: "custom-id" });
    const POST = await loadPOST();
    const res = await POST(makeReq({ inspectionId: "custom-id" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inspectionId: "custom-id" });
    expect(inspectionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "custom-id" },
        create: expect.objectContaining({
          id: "custom-id",
          inspectionNumber: "TEST-custom-id",
        }),
      }),
    );
  });

  it("is idempotent — second call upserts the same id (update branch)", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u_test" } });
    inspectionUpsert.mockResolvedValue({ id: "test-inspection" });

    const POST = await loadPOST();
    const first = await POST(makeReq({}));
    const second = await POST(makeReq({}));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(inspectionUpsert).toHaveBeenCalledTimes(2);
    // Both calls hit the same upsert key — guarantees the spec can re-run.
    expect(inspectionUpsert.mock.calls[0][0]).toEqual(
      inspectionUpsert.mock.calls[1][0],
    );
  });

  // SP-A close-gate seed extension: when readyForClose=true the helper must
  // also upsert a Report (status=COMPLETED), Invoice (status=PAID) and
  // ClaimProgress (anchored on inspectionId) so the close route's
  // canTransition(IN_BILLING → CLOSED) gate is satisfied.
  describe("readyForClose=true", () => {
    it("default behaviour unchanged — no Report/Invoice/ClaimProgress upserts when readyForClose is omitted", async () => {
      getServerSession.mockResolvedValueOnce({ user: { id: "u_test" } });
      inspectionUpsert.mockResolvedValueOnce({ id: "test-inspection" });

      const POST = await loadPOST();
      const res = await POST(makeReq({}));

      expect(res.status).toBe(200);
      expect(inspectionUpsert).toHaveBeenCalledTimes(1);
      expect(reportUpsert).not.toHaveBeenCalled();
      expect(invoiceUpsert).not.toHaveBeenCalled();
      expect(claimProgressUpsert).not.toHaveBeenCalled();
    });

    it("upserts Inspection (status=IN_BILLING) + Report (COMPLETED) + Invoice (PAID) + ClaimProgress when readyForClose=true", async () => {
      getServerSession.mockResolvedValueOnce({ user: { id: "u_test" } });
      inspectionUpsert.mockResolvedValueOnce({ id: "test-inspection" });
      reportUpsert.mockResolvedValueOnce({ id: "test-inspection-report" });
      invoiceUpsert.mockResolvedValueOnce({ id: "test-inspection-invoice" });
      claimProgressUpsert.mockResolvedValueOnce({
        id: "test-inspection-progress",
      });

      const POST = await loadPOST();
      const res = await POST(makeReq({ readyForClose: true }));
      expect(res.status).toBe(200);

      // Inspection forced to IN_BILLING regardless of caller-provided status.
      const inspectionCall = inspectionUpsert.mock.calls[0][0];
      expect(inspectionCall.where).toEqual({ id: "test-inspection" });
      expect(inspectionCall.create.status).toBe("IN_BILLING");
      expect(inspectionCall.update.status).toBe("IN_BILLING");
      // Inspection is FK-linked to the seeded report so loadTransitionContext
      // can resolve Inspection → Report → Invoice.
      expect(inspectionCall.create.reportId).toBe("test-inspection-report");
      expect(inspectionCall.update.reportId).toBe("test-inspection-report");

      // Report upsert — status COMPLETED (state machine's report_sent gate).
      expect(reportUpsert).toHaveBeenCalledTimes(1);
      const reportCall = reportUpsert.mock.calls[0][0];
      expect(reportCall.where).toEqual({ id: "test-inspection-report" });
      expect(reportCall.create.id).toBe("test-inspection-report");
      expect(reportCall.create.status).toBe("COMPLETED");
      expect(reportCall.create.userId).toBe("u_test");
      expect(reportCall.update.status).toBe("COMPLETED");

      // Invoice upsert — status PAID, FK'd to the seeded report.
      expect(invoiceUpsert).toHaveBeenCalledTimes(1);
      const invoiceCall = invoiceUpsert.mock.calls[0][0];
      expect(invoiceCall.where).toEqual({ id: "test-inspection-invoice" });
      expect(invoiceCall.create.id).toBe("test-inspection-invoice");
      expect(invoiceCall.create.status).toBe("PAID");
      expect(invoiceCall.create.reportId).toBe("test-inspection-report");
      expect(invoiceCall.create.userId).toBe("u_test");
      expect(invoiceCall.update.status).toBe("PAID");

      // ClaimProgress upsert — anchored on inspectionId so the close
      // route's claimProgress.updateMany({ where: { inspectionId } }) mirror
      // hits a row.
      expect(claimProgressUpsert).toHaveBeenCalledTimes(1);
      const progressCall = claimProgressUpsert.mock.calls[0][0];
      expect(progressCall.where).toEqual({ id: "test-inspection-progress" });
      expect(progressCall.create.id).toBe("test-inspection-progress");
      expect(progressCall.create.inspectionId).toBe("test-inspection");
      expect(progressCall.create.reportId).toBe("test-inspection-report");
    });

    it("forces status=IN_BILLING even when caller passes status=COMPLETED", async () => {
      getServerSession.mockResolvedValueOnce({ user: { id: "u_test" } });
      inspectionUpsert.mockResolvedValueOnce({ id: "test-inspection" });
      reportUpsert.mockResolvedValueOnce({ id: "test-inspection-report" });
      invoiceUpsert.mockResolvedValueOnce({ id: "test-inspection-invoice" });
      claimProgressUpsert.mockResolvedValueOnce({
        id: "test-inspection-progress",
      });

      const POST = await loadPOST();
      const res = await POST(
        makeReq({ readyForClose: true, status: "COMPLETED" }),
      );
      expect(res.status).toBe(200);

      const inspectionCall = inspectionUpsert.mock.calls[0][0];
      expect(inspectionCall.create.status).toBe("IN_BILLING");
      expect(inspectionCall.update.status).toBe("IN_BILLING");
    });

    it("upserts ClaimProgress AFTER the Inspection — its inspectionId FK requires the Inspection row to exist on fresh DBs", async () => {
      getServerSession.mockResolvedValueOnce({ user: { id: "u_test" } });
      inspectionUpsert.mockResolvedValueOnce({ id: "test-inspection" });
      reportUpsert.mockResolvedValueOnce({ id: "test-inspection-report" });
      invoiceUpsert.mockResolvedValueOnce({ id: "test-inspection-invoice" });
      claimProgressUpsert.mockResolvedValueOnce({
        id: "test-inspection-progress",
      });

      const POST = await loadPOST();
      const res = await POST(makeReq({ readyForClose: true }));
      expect(res.status).toBe(200);

      // Report must precede Inspection (Inspection.reportId FK) …
      expect(reportUpsert.mock.invocationCallOrder[0]).toBeLessThan(
        inspectionUpsert.mock.invocationCallOrder[0],
      );
      // … but ClaimProgress.inspectionId FKs the Inspection, so it must
      // come after — creating it first FK-fails on a fresh DB.
      expect(claimProgressUpsert.mock.invocationCallOrder[0]).toBeGreaterThan(
        inspectionUpsert.mock.invocationCallOrder[0],
      );
    });

    it("re-run with same inspectionId is idempotent — same upsert keys, no duplicates", async () => {
      getServerSession.mockResolvedValue({ user: { id: "u_test" } });
      inspectionUpsert.mockResolvedValue({ id: "test-inspection" });
      reportUpsert.mockResolvedValue({ id: "test-inspection-report" });
      invoiceUpsert.mockResolvedValue({ id: "test-inspection-invoice" });
      claimProgressUpsert.mockResolvedValue({
        id: "test-inspection-progress",
      });

      const POST = await loadPOST();
      const first = await POST(makeReq({ readyForClose: true }));
      const second = await POST(makeReq({ readyForClose: true }));

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      // Each upsert called twice with the SAME `where` key — no duplicates.
      expect(inspectionUpsert.mock.calls[0][0].where).toEqual(
        inspectionUpsert.mock.calls[1][0].where,
      );
      expect(reportUpsert.mock.calls[0][0].where).toEqual(
        reportUpsert.mock.calls[1][0].where,
      );
      expect(invoiceUpsert.mock.calls[0][0].where).toEqual(
        invoiceUpsert.mock.calls[1][0].where,
      );
      expect(claimProgressUpsert.mock.calls[0][0].where).toEqual(
        claimProgressUpsert.mock.calls[1][0].where,
      );
    });
  });
});
