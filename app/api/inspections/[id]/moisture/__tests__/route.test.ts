/**
 * POST /api/inspections/[id]/moisture — persistence of a vision-extracted reading.
 *
 * This is the second half of the meter-photo acceptance: the capture UI sends
 * the AI-extracted value here, and this is where it becomes a MoistureReading
 * row. `components/inspection/__tests__/MeterPhotoCapture.test.tsx` covers the
 * client side of the same hop; these tests pin the server side of the contract
 * it depends on — in particular that `source: "ocr"` survives, so a reading the
 * model read off a meter display is distinguishable from a hand-typed one in
 * the drying log and the audit trail.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const inspectionFindFirst = vi.fn();
const moistureCreate = vi.fn();
const auditCreate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: (...a: unknown[]) => inspectionFindFirst(...a) },
    moistureReading: { create: (...a: unknown[]) => moistureCreate(...a) },
    auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
  },
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: NextRequest,
    _userId: string,
    handler: (body: string) => Promise<Response>,
  ) => handler(await request.text()),
}));

import { POST } from "../route";

const params = Promise.resolve({ id: "insp_1" });

function postRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/inspections/insp_1/moisture", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** The payload the capture UI sends after the tech confirms an AI reading. */
function ocrBody(overrides: Record<string, unknown> = {}) {
  return {
    location: "Living Room — timber flooring, centre",
    surfaceType: "timber",
    moistureLevel: 18.5,
    source: "ocr",
    notes: 'Captured via meter photo OCR. Meter display read: "18.5% WME"',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  inspectionFindFirst.mockResolvedValue({ id: "insp_1", workspaceId: null });
  moistureCreate.mockImplementation(async ({ data }) => ({
    id: "mr_1",
    ...data,
  }));
  auditCreate.mockResolvedValue({ id: "audit_1" });
});

describe("POST /api/inspections/[id]/moisture — vision-extracted reading", () => {
  it("logs the reading with its OCR provenance intact", async () => {
    const response = await POST(postRequest(ocrBody()), { params });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(moistureCreate).toHaveBeenCalledTimes(1);

    const written = moistureCreate.mock.calls[0][0].data;
    expect(written).toMatchObject({
      inspectionId: "insp_1",
      location: "Living Room — timber flooring, centre",
      surfaceType: "timber",
      moistureLevel: 18.5,
      depth: "Surface",
      source: "ocr",
    });
    expect(written.notes).toContain("18.5% WME");
    expect(body.moistureReading.id).toBe("mr_1");
  });

  it("records the reading in the audit trail", async () => {
    await POST(postRequest(ocrBody()), { params });

    expect(auditCreate).toHaveBeenCalledTimes(1);
    const audit = auditCreate.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      inspectionId: "insp_1",
      entityType: "MoistureReading",
      userId: "user_1",
    });
    expect(JSON.parse(audit.changes)).toMatchObject({ moistureLevel: 18.5 });
  });

  it("falls back to manual for a source it does not recognise", async () => {
    await POST(postRequest(ocrBody({ source: "definitely-not-a-source" })), {
      params,
    });

    expect(moistureCreate.mock.calls[0][0].data.source).toBe("manual");
  });

  it("refuses a reading with no numeric value rather than storing a null", async () => {
    // The confirm form blocks this client-side; the route must not rely on that.
    const response = await POST(
      postRequest(ocrBody({ moistureLevel: undefined })),
      { params },
    );

    expect(response.status).toBe(400);
    expect(moistureCreate).not.toHaveBeenCalled();
  });

  it("will not write a reading onto an inspection the caller does not own", async () => {
    inspectionFindFirst.mockResolvedValue(null);

    const response = await POST(postRequest(ocrBody()), { params });

    expect(response.status).toBe(404);
    expect(moistureCreate).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    getServerSession.mockResolvedValue(null);

    const response = await POST(postRequest(ocrBody()), { params });

    expect(response.status).toBe(401);
    expect(moistureCreate).not.toHaveBeenCalled();
  });
});
