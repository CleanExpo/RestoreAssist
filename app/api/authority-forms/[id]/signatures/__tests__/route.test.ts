/**
 * RA-6961 — POST /api/authority-forms/[id]/signatures tenancy regression.
 *
 * The signature UPDATE branch previously keyed only by the client-supplied
 * `signatureId`, ignoring the `formId` in the URL. A caller with access to
 * one form could pass a foreign signatureId (belonging to another tenant's
 * form) and overwrite that signature. The fix scopes the update by
 * `{ id: signatureId, instanceId: formId }` via `updateMany`, treating a
 * zero-count result as 404.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const withIdempotency = vi.fn();
const instanceFindUnique = vi.fn();
const instanceUpdate = vi.fn();
const signatureUpdateMany = vi.fn();
const signatureFindUniqueOrThrow = vi.fn();
const signatureFindMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (...args: unknown[]) => withIdempotency(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authorityFormInstance: {
      findUnique: (...args: unknown[]) => instanceFindUnique(...args),
      update: (...args: unknown[]) => instanceUpdate(...args),
    },
    authorityFormSignature: {
      updateMany: (...args: unknown[]) => signatureUpdateMany(...args),
      findUniqueOrThrow: (...args: unknown[]) =>
        signatureFindUniqueOrThrow(...args),
      findMany: (...args: unknown[]) => signatureFindMany(...args),
    },
  },
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost/api/authority-forms/form-1/signatures",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
}
const params = () => ({ params: Promise.resolve({ id: "form-1" }) });

const ownedForm = {
  id: "form-1",
  status: "PENDING_SIGNATURES",
  report: {
    userId: "user-1",
    assignedManagerId: null,
    assignedAdminId: null,
  },
};

beforeEach(() => {
  getServerSession.mockReset();
  withIdempotency.mockReset();
  instanceFindUnique.mockReset();
  instanceUpdate.mockReset();
  signatureUpdateMany.mockReset();
  signatureFindUniqueOrThrow.mockReset();
  signatureFindMany.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  withIdempotency.mockImplementation(
    async (
      req: Request,
      _userId: string,
      fn: (rawBody: string) => Promise<Response>,
    ) => fn(await req.text()),
  );
  instanceFindUnique.mockResolvedValue(ownedForm);
});

describe("POST /api/authority-forms/[id]/signatures", () => {
  it("updates a signature that belongs to the caller's form", async () => {
    signatureUpdateMany.mockResolvedValueOnce({ count: 1 });
    const signedRow = {
      id: "sig-1",
      instanceId: "form-1",
      signatureData: "data:image/png;base64,abc",
      signedAt: new Date("2026-07-01T00:00:00.000Z"),
    };
    signatureFindUniqueOrThrow.mockResolvedValueOnce(signedRow);
    signatureFindMany.mockResolvedValueOnce([signedRow]);

    const res = await POST(
      makeRequest({ signatureId: "sig-1", signatureData: "data:image/png;base64,abc" }),
      params(),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.signature.id).toBe("sig-1");
    expect(json.allSigned).toBe(true);
    expect(signatureUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sig-1", instanceId: "form-1" },
      }),
    );
    // All signatures signed → form transitions to COMPLETED.
    expect(instanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "form-1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  it("RA-6961: a signatureId belonging to another tenant's form returns 404 and mutates nothing", async () => {
    // The signature exists, but its instanceId is a different form than the
    // one in the URL — updateMany's compound where excludes it (count: 0).
    signatureUpdateMany.mockResolvedValueOnce({ count: 0 });

    const res = await POST(
      makeRequest({
        signatureId: "sig-belongs-to-another-tenant",
        signatureData: "data:image/png;base64,attacker-payload",
      }),
      params(),
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
    expect(signatureUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sig-belongs-to-another-tenant", instanceId: "form-1" },
      }),
    );
    // Nothing downstream ran: no re-fetch, no completion check, no status write.
    expect(signatureFindUniqueOrThrow).not.toHaveBeenCalled();
    expect(signatureFindMany).not.toHaveBeenCalled();
    expect(instanceUpdate).not.toHaveBeenCalled();
  });

  it("403 when the caller has no relationship to the form", async () => {
    instanceFindUnique.mockResolvedValueOnce({
      id: "form-1",
      status: "PENDING_SIGNATURES",
      report: {
        userId: "someone-else",
        assignedManagerId: null,
        assignedAdminId: null,
      },
    });

    const res = await POST(
      makeRequest({ signatureId: "sig-1", signatureData: "data:image/png;base64,abc" }),
      params(),
    );

    expect(res.status).toBe(403);
    expect(signatureUpdateMany).not.toHaveBeenCalled();
  });
});
