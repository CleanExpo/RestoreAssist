/**
 * RA-8515 — the intake route with the REAL withIdempotency wrapper. Prisma is
 * replaced by an in-memory idempotencyRecord store (the same pattern as
 * lib/__tests__/idempotency.test.ts), shared by the transaction client so
 * completeIdempotentSuccessInTransaction writes the same rows the wrapper
 * reads. No database is needed. The Postgres version of the replay lives in
 * lib/jobs/__tests__/office-intake.route.test.ts (npm run test:db).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => {
  type Row = {
    id: string;
    cacheKey: string;
    scope: string;
    key: string;
    fingerprint: string;
    status: string;
    responseStatus: number | null;
    responseBody: string | null;
    responseContentType: string | null;
    expiresAt: Date;
  };
  type Where = Partial<Omit<Row, "expiresAt">> & { expiresAt?: { gt?: Date; lt?: Date } };
  const rows = new Map<string, Row>();
  let n = 0;
  const matches = (r: Row, w: Where) =>
    (w.cacheKey === undefined || r.cacheKey === w.cacheKey) &&
    (w.id === undefined || r.id === w.id) &&
    (w.scope === undefined || r.scope === w.scope) &&
    (w.key === undefined || r.key === w.key) &&
    (w.fingerprint === undefined || r.fingerprint === w.fingerprint) &&
    (w.status === undefined || r.status === w.status) &&
    (w.expiresAt?.gt === undefined || r.expiresAt > w.expiresAt.gt) &&
    (w.expiresAt?.lt === undefined || r.expiresAt < w.expiresAt.lt);
  const idempotencyRecord = {
    async create({ data }: { data: Omit<Row, "id" | "responseStatus" | "responseBody" | "responseContentType"> }) {
      if (rows.has(data.cacheKey)) throw { code: "P2002" };
      const row: Row = { ...data, id: `res-${++n}`, responseStatus: null, responseBody: null, responseContentType: null };
      rows.set(data.cacheKey, row);
      return { id: row.id };
    },
    async findUnique({ where }: { where: { cacheKey: string } }) {
      return rows.get(where.cacheKey) ?? null;
    },
    async updateMany({ where, data }: { where: Where; data: Partial<Row> }) {
      let count = 0;
      for (const [k, r] of rows) {
        if (matches(r, where)) {
          rows.set(k, { ...r, ...data });
          count++;
        }
      }
      return { count };
    },
    async deleteMany({ where }: { where: Where }) {
      let count = 0;
      for (const [k, r] of rows) {
        if (matches(r, where)) {
          rows.delete(k);
          count++;
        }
      }
      return { count };
    },
  };
  const db = {
    idempotencyRecord,
    user: { findUnique: vi.fn() },
    inspection: { create: vi.fn() },
    auditLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(db)),
  };
  return {
    rows,
    db,
    getServerSession: vi.fn(),
    allocate: vi.fn(),
    seed: vi.fn(async (..._a: unknown[]) => true),
  };
});

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => m.getServerSession(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: m.db }));
vi.mock("@/lib/jobs/job-number", async () => {
  const real = await vi.importActual<typeof import("@/lib/jobs/job-number")>("@/lib/jobs/job-number");
  return { ...real, allocateJobNumber: (...a: unknown[]) => m.allocate(...a) };
});
vi.mock("@/lib/integrations/zoho/queue", () => ({ scheduleZohoInspectionPush: () => {} }));
vi.mock("@/lib/compliance/seed-make-safe", () => ({
  ensureMakeSafeSeeded: (...a: unknown[]) => m.seed(...a),
}));
vi.mock("@/lib/observability", () => ({ reportError: () => {} }));

import { POST } from "../route";

const KEY = "aaaaaaaa-1111-4222-8333-444444444444";
const body = {
  propertyAddress: "12 Example Street, Penrith NSW",
  propertyPostcode: "2750",
  clientType: "CLIENT",
  claimType: "WATER",
};

function post(payload: unknown, key = KEY) {
  return new NextRequest("http://localhost/api/inspections/intake", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.rows.clear();
  m.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  m.db.user.findUnique.mockResolvedValue({ organizationId: "org-1" });
  let value = 0;
  m.allocate.mockImplementation(async () => {
    value += 1;
    return { jobNumber: `DRC-${String(value).padStart(4, "0")}`, prefix: "DRC", value };
  });
  m.db.inspection.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `insp-${String(data.jobNumber)}`,
    jobNumber: data.jobNumber,
    inspectionNumber: data.inspectionNumber,
    claimType: data.claimType,
  }));
  m.seed.mockResolvedValue(true);
});

describe("POST /api/inspections/intake with the real idempotency wrapper (RA-8515)", () => {
  it("replays the first job, and the replay says make-safe did not set up", async () => {
    m.seed.mockRejectedValue(new Error("seed down"));
    const first = await POST(post(body));
    expect(first.status).toBe(201);
    const firstJson = await first.json();
    expect(firstJson.makeSafeSeeded).toBe(false);

    const replay = await POST(post(body));
    expect(replay.status).toBe(201);
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await replay.json()).toEqual(firstJson);
    expect(m.allocate).toHaveBeenCalledTimes(1);
    expect(m.db.inspection.create).toHaveBeenCalledTimes(1);
  });

  it("replays makeSafeSeeded true after a good seed", async () => {
    await POST(post(body));
    const replay = await POST(post(body));
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    expect((await replay.json()).makeSafeSeeded).toBe(true);
  });

  it("caches a refusal: the same refused body replays the refusal and takes no number", async () => {
    const bad = { ...body, propertyPostcode: "27" };
    const first = await POST(post(bad));
    expect(first.status).toBe(400);
    const firstJson = await first.json();
    expect(firstJson.error.fields.propertyPostcode).toBeDefined();

    const replay = await POST(post(bad));
    expect(replay.status).toBe(400);
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await replay.json()).toEqual(firstJson);
    expect(m.allocate).not.toHaveBeenCalled();
  });

  it("refuses the same key with a different body and takes no second number", async () => {
    await POST(post(body));
    const other = await POST(post({ ...body, propertyAddress: "99 Other Road, Penrith NSW" }));
    expect(other.status).toBe(409);
    expect((await other.json()).error).toMatch(/different request body/);
    expect(m.allocate).toHaveBeenCalledTimes(1);
  });

  it("a new key after a refusal saves the corrected form", async () => {
    await POST(post({ ...body, propertyPostcode: "27" }));
    const fixed = await POST(post(body, "bbbbbbbb-1111-4222-8333-444444444444"));
    expect(fixed.status).toBe(201);
    expect((await fixed.json()).inspection.jobNumber).toBe("DRC-0001");
  });
});
