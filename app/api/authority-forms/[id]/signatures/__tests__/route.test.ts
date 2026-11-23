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
const instanceUpdateMany = vi.fn();
const signatureUpdateMany = vi.fn();
const signatureFindUniqueOrThrow = vi.fn();
const signatureFindMany = vi.fn();
const signatureFindFirst = vi.fn();
const signatureCreate = vi.fn();

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
      updateMany: (...args: unknown[]) => instanceUpdateMany(...args),
    },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        authorityFormInstance: {
          updateMany: (...args: unknown[]) => instanceUpdateMany(...args),
        },
        authorityFormSignature: {
          create: (...args: unknown[]) => signatureCreate(...args),
        },
      }),
    authorityFormSignature: {
      updateMany: (...args: unknown[]) => signatureUpdateMany(...args),
      findUniqueOrThrow: (...args: unknown[]) =>
        signatureFindUniqueOrThrow(...args),
      findMany: (...args: unknown[]) => signatureFindMany(...args),
      findFirst: (...args: unknown[]) => signatureFindFirst(...args),
      create: (...args: unknown[]) => signatureCreate(...args),
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
  signatures: [{ signedAt: null }],
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
  instanceUpdateMany.mockReset();
  signatureUpdateMany.mockReset();
  signatureFindUniqueOrThrow.mockReset();
  signatureFindMany.mockReset();
  signatureFindFirst.mockReset();
  signatureCreate.mockReset();

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
        where: {
          id: "sig-1",
          instanceId: "form-1",
          signedAt: null,
          instance: { status: { notIn: ["CANCELLED", "COMPLETED"] } },
        },
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
        where: expect.objectContaining({
          id: "sig-belongs-to-another-tenant",
          instanceId: "form-1",
        }),
      }),
    );
    // The 404/409 lookup is scoped by this form, so it cannot reveal
    // another tenant's signature.
    expect(signatureFindFirst).toHaveBeenCalledWith(
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

  it("RA-8400: a second sign on an already-signed slot returns 409 and keeps the first record", async () => {
    // The slot exists on this form but is already signed: the unsigned-slot
    // guard in the write matches 0 rows.
    signatureUpdateMany.mockResolvedValueOnce({ count: 0 });
    signatureFindFirst.mockResolvedValueOnce({ id: "sig-1" });

    const res = await POST(
      makeRequest({
        signatureId: "sig-1",
        signatureData: "data:image/png;base64,replacement",
        signatoryName: "Someone Else",
      }),
      params(),
    );

    expect(res.status).toBe(409);
    expect(signatureUpdateMany.mock.calls[0][0].where).toMatchObject({
      id: "sig-1",
      instanceId: "form-1",
      signedAt: null,
    });
    expect(signatureFindUniqueOrThrow).not.toHaveBeenCalled();
    expect(instanceUpdate).not.toHaveBeenCalled();
  });

  it("RA-8400: a cancelled form refuses a staff signature and a new slot", async () => {
    instanceFindUnique.mockResolvedValue({ ...ownedForm, status: "CANCELLED" });

    const sign = await POST(
      makeRequest({ signatureId: "sig-1", signatureData: "data:image/png;base64,abc" }),
      params(),
    );
    expect(sign.status).toBe(409);

    const slot = await POST(
      makeRequest({
        action: "add_signatory",
        signatoryName: "New Person",
        signatoryRole: "CLIENT",
      }),
      params(),
    );
    expect(slot.status).toBe(409);

    expect(signatureUpdateMany).not.toHaveBeenCalled();
    expect(signatureCreate).not.toHaveBeenCalled();
    expect(instanceUpdate).not.toHaveBeenCalled();
  });

  const slot = {
    action: "add_signatory",
    signatoryName: "New Person",
    signatoryRole: "CLIENT",
  };

  it("RA-8400: a partly signed form takes no new signatory slot", async () => {
    instanceFindUnique.mockResolvedValue({
      ...ownedForm,
      status: "PENDING_SIGNATURES",
      signatures: [{ signedAt: new Date("2026-11-01T00:00:00Z") }],
    });
    const res = await POST(makeRequest(slot), params());
    expect(res.status).toBe(409);
    expect(signatureCreate).not.toHaveBeenCalled();
    expect(instanceUpdateMany).not.toHaveBeenCalled();
  });

  it("RA-8400: the slot is created only after a conditional lock on an open, unsigned form", async () => {
    instanceUpdateMany.mockResolvedValue({ count: 1 });
    signatureCreate.mockResolvedValue({ id: "sig-new" });
    const res = await POST(makeRequest(slot), params());
    expect(res.status).toBe(200);
    expect(instanceUpdateMany.mock.calls[0][0].where).toEqual({
      id: "form-1",
      status: { notIn: ["CANCELLED", "COMPLETED"] },
      signatures: { none: { signedAt: { not: null } } },
    });
    expect(signatureCreate).toHaveBeenCalledTimes(1);
  });

  it("RA-8400: a signature or cancellation landing after the read blocks the create", async () => {
    instanceUpdateMany.mockResolvedValue({ count: 0 });
    const res = await POST(makeRequest(slot), params());
    expect(res.status).toBe(409);
    expect(signatureCreate).not.toHaveBeenCalled();
  });
});
