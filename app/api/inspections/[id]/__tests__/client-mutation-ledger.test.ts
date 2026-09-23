/**
 * RA-7586 — the offline-sync ledger (`ClientMutation`) for the inspection
 * capture routes.
 *
 * The mobile and offline capture clients send `Idempotency-Key` plus
 * `x-restoreassist-mutation-id`, and `withIdempotency` records a ledger row
 * for them. The routes used to hand it the inspection's `workspaceId`, which
 * no create path writes, so no row was ever recorded. These tests run the
 * real `withIdempotency` against production-shaped data (`workspaceId: null`)
 * and assert on the ledger rows it writes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const idempotencyRecords = new Map<string, any>();
  return {
    getServerSession: vi.fn(),
    getWorkspaceForUser: vi.fn(),
    inspectionFindFirst: vi.fn(),
    moistureCreate: vi.fn(),
    environmentalCreate: vi.fn(),
    affectedAreaCreate: vi.fn(),
    auditCreate: vi.fn(),
    clientMutationCreate: vi.fn(),
    clientMutationUpdateMany: vi.fn(),
    idempotencyRecords,
    idempotencyRecord: {
      async create({ data }: { data: any }) {
        if (idempotencyRecords.has(data.cacheKey)) throw { code: "P2002" };
        const record = {
          ...data,
          responseStatus: data.responseStatus ?? null,
          responseBody: data.responseBody ?? null,
          responseContentType: data.responseContentType ?? null,
        };
        idempotencyRecords.set(data.cacheKey, record);
        return record;
      },
      async findUnique({ where }: { where: { cacheKey: string } }) {
        return idempotencyRecords.get(where.cacheKey) ?? null;
      },
      async update({ where, data }: { where: { cacheKey: string }; data: any }) {
        const updated = { ...idempotencyRecords.get(where.cacheKey), ...data };
        idempotencyRecords.set(where.cacheKey, updated);
        return updated;
      },
      async deleteMany() {
        return { count: 0 };
      },
    },
  };
});

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => mocks.getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: async () => null,
}));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: (...a: unknown[]) => mocks.getWorkspaceForUser(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: (...a: unknown[]) => mocks.inspectionFindFirst(...a),
    },
    moistureReading: {
      create: (...a: unknown[]) => mocks.moistureCreate(...a),
    },
    environmentalData: {
      create: (...a: unknown[]) => mocks.environmentalCreate(...a),
    },
    affectedArea: {
      create: (...a: unknown[]) => mocks.affectedAreaCreate(...a),
    },
    auditLog: { create: (...a: unknown[]) => mocks.auditCreate(...a) },
    idempotencyRecord: mocks.idempotencyRecord,
    clientMutation: {
      create: (...a: unknown[]) => mocks.clientMutationCreate(...a),
      updateMany: (...a: unknown[]) => mocks.clientMutationUpdateMany(...a),
    },
  },
}));

import { POST as postMoisture } from "../moisture/route";
import { POST as postEnvironmental } from "../environmental/route";
import { POST as postAffectedArea } from "../affected-areas/route";

type Handler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>;

const ROUTES: Array<{
  name: string;
  segment: string;
  post: Handler;
  body: Record<string, unknown>;
  mutationType: string;
  okStatus: number;
}> = [
  {
    name: "moisture",
    segment: "moisture",
    post: postMoisture as Handler,
    body: { location: "Living room", surfaceType: "timber", moistureLevel: 18.5 },
    mutationType: "moisture-reading",
    okStatus: 201,
  },
  {
    name: "environmental",
    segment: "environmental",
    post: postEnvironmental as Handler,
    body: { ambientTemperature: 22, humidityLevel: 55 },
    mutationType: "environmental-data",
    okStatus: 200,
  },
  {
    name: "affected-areas",
    segment: "affected-areas",
    post: postAffectedArea as Handler,
    body: { roomZoneId: "rz_1", affectedAreaSqm: 12, waterSource: "Category 1" },
    mutationType: "affected-area",
    okStatus: 201,
  },
];

function syncRequest(segment: string, body: Record<string, unknown>, n: string) {
  return new NextRequest(`http://localhost/api/inspections/insp_1/${segment}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `idem-${segment}-${n}`,
      "x-restoreassist-mutation-id": `ra-${segment}-${n}`,
    },
    body: JSON.stringify(body),
  });
}

const params = () => ({ params: Promise.resolve({ id: "insp_1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.idempotencyRecords.clear();
  mocks.getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.getWorkspaceForUser.mockResolvedValue({ id: "ws_user", name: "Crew" });
  // Production reality: no create path writes Inspection.workspaceId.
  mocks.inspectionFindFirst.mockResolvedValue({ id: "insp_1", workspaceId: null });
  for (const create of [
    mocks.moistureCreate,
    mocks.environmentalCreate,
    mocks.affectedAreaCreate,
  ]) {
    create.mockImplementation(async ({ data }: { data: any }) => ({
      id: "row_1",
      ...data,
    }));
  }
  mocks.auditCreate.mockResolvedValue({ id: "audit_1" });
  mocks.clientMutationCreate.mockResolvedValue({ id: "cm_1" });
  mocks.clientMutationUpdateMany.mockResolvedValue({ count: 1 });
});

describe.each(ROUTES)(
  "POST /api/inspections/[id]/$name — client-mutation ledger (RA-7586)",
  ({ segment, post, body, mutationType, okStatus }) => {
    it("records the ledger row under the signed-in user's workspace when the inspection has none", async () => {
      const res = await post(syncRequest(segment, body, "1"), params());

      expect(res.status).toBe(okStatus);
      expect(mocks.getWorkspaceForUser).toHaveBeenCalledWith("user_1");
      expect(mocks.clientMutationCreate).toHaveBeenCalledTimes(1);
      expect(mocks.clientMutationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "ws_user",
          userId: "user_1",
          inspectionId: "insp_1",
          mutationId: `ra-${segment}-1`,
          mutationType,
          method: "POST",
          path: `/api/inspections/insp_1/${segment}`,
          status: "PENDING",
        }),
      });
      expect(mocks.clientMutationUpdateMany).toHaveBeenCalledWith({
        where: { workspaceId: "ws_user", mutationId: `ra-${segment}-1` },
        data: expect.objectContaining({
          status: "COMPLETE",
          responseStatus: okStatus,
        }),
      });
    });

    it("still saves, with no ledger row, when the user has no workspace", async () => {
      mocks.getWorkspaceForUser.mockResolvedValue(null);

      const res = await post(syncRequest(segment, body, "2"), params());

      expect(res.status).toBe(okStatus);
      expect(mocks.clientMutationCreate).not.toHaveBeenCalled();
      expect(mocks.clientMutationUpdateMany).not.toHaveBeenCalled();
    });

    it("still refuses an inspection the caller does not own", async () => {
      mocks.inspectionFindFirst.mockResolvedValue(null);

      const res = await post(syncRequest(segment, body, "3"), params());

      expect(res.status).toBe(404);
      expect(mocks.inspectionFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "insp_1", userId: "user_1" } }),
      );
      expect(mocks.clientMutationCreate).not.toHaveBeenCalled();
    });
  },
);
