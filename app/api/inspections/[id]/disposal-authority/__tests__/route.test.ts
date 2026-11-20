/**
 * POST /api/inspections/[id]/disposal-authority.
 *
 * AuditLog's time column is `timestamp`; it has no `createdAt`. The route
 * selected `createdAt`, which Prisma rejects at runtime, so recording a signed
 * disposal authority always failed. The fake below behaves like Prisma here:
 * selecting a column the model does not have throws.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const resolveInspectionWrite = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveInspectionWrite: (...a: unknown[]) => resolveInspectionWrite(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
  },
}));

import { POST } from "../route";

const RECORDED_AT = new Date("2026-10-13T04:00:00.000Z");
const AUDIT_LOG_ROW = {
  id: "audit_1",
  inspectionId: "insp_1",
  userId: "user_1",
  action: "DISPOSAL_AUTHORITY_RECORDED",
  timestamp: RECORDED_AT,
};

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/inspections/insp_1/disposal-authority", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: "insp_1" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  resolveInspectionWrite.mockResolvedValue({ ok: true });
  auditLogCreate.mockImplementation(
    async ({ select }: { select: Record<string, boolean> }) => {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(select)) {
        if (!(key in AUDIT_LOG_ROW)) {
          throw new Error(`Unknown field \`${key}\` for select statement on model AuditLog`);
        }
        out[key] = AUDIT_LOG_ROW[key as keyof typeof AUDIT_LOG_ROW];
      }
      return out;
    },
  );
});

describe("POST /api/inspections/[id]/disposal-authority", () => {
  it("records the authority and reports the audit row's timestamp", async () => {
    const res = await post({ signerName: "Jo Owner", reference: "PO-1" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      disposalAuthority: {
        auditLogId: "audit_1",
        recordedAt: RECORDED_AT.toISOString(),
      },
    });
  });

  it("rejects a missing signer before writing anything", async () => {
    const res = await post({ signerName: " " });

    expect(res.status).toBe(400);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});
