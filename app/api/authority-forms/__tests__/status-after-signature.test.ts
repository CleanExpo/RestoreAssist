/**
 * RA-8438 — the status that follows a signature.
 *
 * Runs the real public sign route and the real staff signature route against
 * a small in-memory store. `$transaction` snapshots the store and restores it
 * if the callback throws, the way Postgres does, so "signature and status land
 * together or not at all" is observable.
 *
 *  1. Staff signs in person on a PENDING_SIGNATURES form, one of two slots
 *     signed -> PARTIALLY_SIGNED (main left it "Sent").
 *  2. The status write fails -> the public signature is rolled back, so the
 *     client's retry can still sign (main kept the signature, 500, and
 *     "already signed" on retry).
 *  3. A racing signer completes the form between this signer's count and its
 *     status write -> the partial write must not move COMPLETED backwards.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  getClientIp: vi.fn().mockReturnValue("1.2.3.4"),
}));
vi.mock("@/lib/auth/botid", () => ({
  verifyBotId: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/authority-forms/notify-signatory-copy", () => ({
  notifySignatoryOfSignedCopy: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    req: Request,
    _u: string,
    fn: (raw: string) => Promise<Response>,
  ) => fn(await req.text()),
}));

type Sig = {
  id: string;
  instanceId: string;
  signatureRequestToken: string | null;
  signatoryName: string;
  signatoryEmail: string | null;
  signedAt: Date | null;
  signatureData?: string;
  createdAt: Date;
};
type Form = { id: string; status: string; completedAt: Date | null };

const db = vi.hoisted(() => ({
  form: null as unknown as Form,
  sigs: [] as Sig[],
  failNextStatusWrite: false,
  beforeStatusWrite: null as null | (() => void),
}));

function matchStatus(
  status: string,
  cond: unknown,
): boolean {
  if (cond === undefined) return true;
  if (typeof cond === "string") return status === cond;
  const c = cond as { in?: string[]; notIn?: string[] };
  if (c.in && !c.in.includes(status)) return false;
  if (c.notIn && c.notIn.includes(status)) return false;
  return true;
}

function statusWriteHook(data: { status?: string }) {
  if (data.status === undefined) return;
  db.beforeStatusWrite?.();
  db.beforeStatusWrite = null;
  if (db.failNextStatusWrite) {
    db.failNextStatusWrite = false;
    throw new Error("simulated status write failure");
  }
}

vi.mock("@/lib/prisma", () => {
  const sigMatches = (s: Sig, w: Record<string, unknown>) =>
    Object.entries(w).every(([k, v]) =>
      v === null ? (s as never)[k] === null : (s as never)[k] === v,
    );
  const client = {
    authorityFormSignature: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        db.sigs.find((s) => sigMatches(s, where)) ?? null,
      findUniqueOrThrow: async ({ where }: { where: Record<string, unknown> }) => {
        const s = db.sigs.find((x) => sigMatches(x, where));
        if (!s) throw new Error("not found");
        return s;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        db.sigs.filter((s) => sigMatches(s, where)),
      count: async ({ where }: { where: Record<string, unknown> }) =>
        db.sigs.filter((s) => sigMatches(s, where)).length,
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<Sig>;
      }) => {
        const hit = db.sigs.filter((s) => sigMatches(s, where));
        for (const s of hit) Object.assign(s, data);
        return { count: hit.length };
      },
    },
    authorityFormInstance: {
      findUnique: async () => ({
        ...db.form,
        report: { userId: "user-1", assignedManagerId: null, assignedAdminId: null },
      }),
      update: async ({ data }: { data: Partial<Form> }) => {
        statusWriteHook(data);
        Object.assign(db.form, data);
        return db.form;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status?: unknown };
        data: Partial<Form>;
      }) => {
        statusWriteHook(data);
        if (where.id !== db.form.id || !matchStatus(db.form.status, where.status))
          return { count: 0 };
        Object.assign(db.form, data);
        return { count: 1 };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = structuredClone({ form: db.form, sigs: db.sigs });
      try {
        return await fn(client);
      } catch (e) {
        db.form = snapshot.form;
        db.sigs = snapshot.sigs;
        throw e;
      }
    },
  };
  return { prisma: client };
});

import { POST as publicSign } from "../sign/[token]/route";
import { POST as staffSign } from "../[id]/signatures/route";

const TOKEN_A = "11111111-1111-4111-8111-111111111111";
const TOKEN_B = "22222222-2222-4222-8222-222222222222";

function seed(status: string, signed: [boolean, boolean] = [false, false]) {
  db.form = { id: "f1", status, completedAt: null };
  db.sigs = [
    {
      id: "s1",
      instanceId: "f1",
      signatureRequestToken: TOKEN_A,
      signatoryName: "Margaret",
      signatoryEmail: null,
      signedAt: signed[0] ? new Date() : null,
      createdAt: new Date(1),
    },
    {
      id: "s2",
      instanceId: "f1",
      signatureRequestToken: TOKEN_B,
      signatoryName: "Owen",
      signatoryEmail: null,
      signedAt: signed[1] ? new Date() : null,
      createdAt: new Date(2),
    },
  ];
  db.failNextStatusWrite = false;
  db.beforeStatusWrite = null;
}

const signPublic = (token: string) =>
  publicSign(
    new NextRequest(`http://localhost/api/authority-forms/sign/${token}`, {
      method: "POST",
      body: JSON.stringify({ signatureData: "data:image/png;base64,AA" }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ token }) },
  );

const signStaff = (signatureId: string) =>
  staffSign(
    new NextRequest("http://localhost/api/authority-forms/f1/signatures", {
      method: "POST",
      body: JSON.stringify({ signatureId, signatureData: "data:image/png;base64,AA" }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: "f1" }) },
  );

beforeEach(() => seed("PENDING_SIGNATURES"));

describe("RA-8438 status after a signature", () => {
  it("staff in-person sign on a PENDING_SIGNATURES form with one of two slots signed ends PARTIALLY_SIGNED", async () => {
    const res = await signStaff("s1");
    expect(res.status).toBe(200);
    expect((await res.json()).allSigned).toBe(false);
    expect(db.form.status).toBe("PARTIALLY_SIGNED");
  });

  it("staff signing the last slot ends COMPLETED", async () => {
    seed("PARTIALLY_SIGNED", [true, false]);
    const res = await signStaff("s2");
    expect(res.status).toBe(200);
    expect(db.form.status).toBe("COMPLETED");
    expect(db.form.completedAt).toBeInstanceOf(Date);
  });

  it("a failing status write rolls back the public signature, and the retry signs and completes", async () => {
    seed("PARTIALLY_SIGNED", [false, true]);
    db.failNextStatusWrite = true;

    const first = await signPublic(TOKEN_A);
    expect(first.status).toBe(500);
    expect(db.sigs.find((s) => s.id === "s1")!.signedAt).toBeNull();
    expect(db.form.status).toBe("PARTIALLY_SIGNED");

    const retry = await signPublic(TOKEN_A);
    expect(retry.status).toBe(200);
    expect((await retry.json()).allSigned).toBe(true);
    expect(db.form.status).toBe("COMPLETED");
  });

  it("a partial-sign write never overwrites COMPLETED set by a racing signer", async () => {
    // Signer A counts one unsigned slot; before A's status write lands,
    // signer B's transaction commits COMPLETED.
    db.beforeStatusWrite = () => {
      db.form.status = "COMPLETED";
      db.form.completedAt = new Date();
    };
    const res = await signPublic(TOKEN_A);
    expect(res.status).toBe(200);
    expect(db.form.status).toBe("COMPLETED");
  });

  it("public sign of the first of two slots on a PENDING_SIGNATURES form ends PARTIALLY_SIGNED", async () => {
    const res = await signPublic(TOKEN_A);
    expect(res.status).toBe(200);
    expect(db.form.status).toBe("PARTIALLY_SIGNED");
  });
});
