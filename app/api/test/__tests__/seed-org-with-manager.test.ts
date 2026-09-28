import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-7721 A1. The route must validate the whole body before any Prisma call,
// then run every write on the transaction client `tx`. So the mock keeps TWO
// clients: `prisma` (top level) and `txMock` (what $transaction hands the
// callback). A write that lands on `prisma` escaped the transaction.

type Spy = ReturnType<typeof vi.fn>;

const { top, txMock, transaction } = vi.hoisted(() => {
  const makeClient = () => ({
    user: { create: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    organization: { create: vi.fn() },
    userInvite: { create: vi.fn() },
    workspace: { create: vi.fn() },
    featureEntitlement: { create: vi.fn() },
  });
  return { top: makeClient(), txMock: makeClient(), transaction: vi.fn() };
});
type Client = typeof top;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: top.user,
    organization: top.organization,
    userInvite: top.userInvite,
    workspace: top.workspace,
    featureEntitlement: top.featureEntitlement,
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

import { POST } from "../seed-org-with-manager/route";

const URL = "http://localhost/api/test/seed-org-with-manager";

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

function allSpies(client: Client): Spy[] {
  return [
    client.user.create,
    client.user.update,
    client.user.upsert,
    client.organization.create,
    client.userInvite.create,
    client.workspace.create,
    client.featureEntitlement.create,
  ];
}

function expectZeroWrites() {
  expect(transaction).not.toHaveBeenCalled();
  for (const spy of [...allSpies(top), ...allSpies(txMock)]) {
    expect(spy).not.toHaveBeenCalled();
  }
}

function expectNothingOnPrisma() {
  for (const spy of allSpies(top)) expect(spy).not.toHaveBeenCalled();
}

/** Every case sets all three guard keys explicitly. "" means unset. */
function env(allow: string, vercelEnv: string, prodOptIn: string) {
  vi.stubEnv("ALLOW_TEST_HELPERS", allow);
  vi.stubEnv("VERCEL_ENV", vercelEnv);
  vi.stubEnv("ALLOW_TEST_HELPERS_IN_PROD_ENV", prodOptIn);
}
const unblocked = () => env("true", "", "");

beforeEach(() => {
  for (const spy of [...allSpies(top), ...allSpies(txMock)]) spy.mockReset();
  transaction.mockReset();
  transaction.mockImplementation(async (cb: (tx: typeof txMock) => unknown) =>
    cb(txMock),
  );
  txMock.user.create.mockResolvedValue({ id: "mgr_1" });
  txMock.user.upsert.mockResolvedValue({ id: "mgr_1" });
  txMock.user.update.mockResolvedValue({ id: "mgr_1" });
  txMock.organization.create.mockResolvedValue({ id: "org_1" });
  txMock.userInvite.create.mockResolvedValue({ id: "inv_1" });
  txMock.workspace.create.mockResolvedValue({ id: "ws_1" });
  txMock.featureEntitlement.create.mockResolvedValue({ id: "fe_1" });
  // The top-level client answers too, so a write that escapes the transaction
  // is caught by a not-called assertion, not by a TypeError on undefined.
  top.user.create.mockResolvedValue({ id: "mgr_1" });
  top.user.upsert.mockResolvedValue({ id: "mgr_1" });
  top.user.update.mockResolvedValue({ id: "mgr_1" });
  top.organization.create.mockResolvedValue({ id: "org_1" });
  top.userInvite.create.mockResolvedValue({ id: "inv_1" });
  top.workspace.create.mockResolvedValue({ id: "ws_1" });
  top.featureEntitlement.create.mockResolvedValue({ id: "fe_1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The base writes every 200 seed makes, all on txMock. */
function expectBaseWritesOnTx() {
  expect(transaction).toHaveBeenCalledTimes(1);
  expect(txMock.user.create).toHaveBeenCalledTimes(1);
  expect(txMock.organization.create).toHaveBeenCalledTimes(1);
  expect(txMock.user.update).toHaveBeenCalledTimes(1);
  expect(txMock.user.upsert).not.toHaveBeenCalled();
  expectNothingOnPrisma();
}

describe("POST /api/test/seed-org-with-manager", () => {
  describe("A6: blocked environment answers 404 with zero writes", () => {
    it("A6(i) ALLOW_TEST_HELPERS=true, VERCEL_ENV=production, no opt-in → 404", async () => {
      env("true", "production", "");
      const res = await POST(makeReq({ technicianSeats: 1 }));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: "Test helpers are not enabled in this environment",
      });
      expectZeroWrites();
    });

    it("A6(ii) both keys unset → 404", async () => {
      env("", "", "");
      const res = await POST(makeReq({ technicianSeats: 1 }));
      expect(res.status).toBe(404);
      expectZeroWrites();
    });

    it("A6 control: production with the opt-in is unblocked and writes", async () => {
      env("true", "production", "true");
      const res = await POST(makeReq({ technicianSeats: 1 }));
      expect(res.status).toBe(200);
      expectBaseWritesOnTx();
      expect(txMock.featureEntitlement.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("A7: legacy bodies keep today's writes", () => {
    it.each([
      ["{}", {}],
      ["{managerEmail}", { managerEmail: "mgr-legacy@test.com" }],
      ["{expiresInDays:-1}", { expiresInDays: -1 }],
      ["{markUsed:true}", { markUsed: true }],
    ])(
      "A7 %s → 200, user+org+link+invite on tx, no workspace",
      async (_l, body) => {
        unblocked();
        const res = await POST(makeReq(body));
        expect(res.status).toBe(200);
        const json = (await res.json()) as {
          token: string;
          inviteeEmail: string;
          managerEmail: string;
          organizationId: string;
        };
        expect(json.token).toMatch(/^[0-9a-f]{48}$/);
        expect(json.inviteeEmail).toMatch(/^tech-.+@test\.local$/);
        expect(json.organizationId).toBe("org_1");

        expectBaseWritesOnTx();
        expect(txMock.userInvite.create).toHaveBeenCalledTimes(1);
        expect(txMock.workspace.create).not.toHaveBeenCalled();
        expect(txMock.featureEntitlement.create).not.toHaveBeenCalled();

        const inviteArgs = txMock.userInvite.create.mock.calls[0][0] as {
          data: { usedAt: Date | null; expiresAt: Date; token: string };
        };
        expect(inviteArgs.data.token).toBe(json.token);
        if ("markUsed" in body) {
          expect(inviteArgs.data.usedAt).toBeInstanceOf(Date);
        } else {
          expect(inviteArgs.data.usedAt).toBeNull();
        }
        if ("expiresInDays" in body) {
          expect(inviteArgs.data.expiresAt.getTime()).toBeLessThan(Date.now());
        } else {
          expect(inviteArgs.data.expiresAt.getTime()).toBeGreaterThan(
            Date.now(),
          );
        }
        if ("managerEmail" in body) {
          expect(json.managerEmail).toBe("mgr-legacy@test.com");
          const userArgs = txMock.user.create.mock.calls[0][0] as {
            data: { email: string };
          };
          expect(userArgs.data.email).toBe("mgr-legacy@test.com");
        } else {
          expect(json.managerEmail).toMatch(/^mgr-.+@test\.local$/);
        }
      },
    );
  });

  describe("A1/A1z/A2: technician seats", () => {
    it("A1 technicianSeats=1 → READY Workspace + active TECHNICIAN_SEATS seats 1, on tx only", async () => {
      unblocked();
      const res = await POST(makeReq({ technicianSeats: 1 }));
      expect(res.status).toBe(200);
      expectBaseWritesOnTx();
      expect(txMock.workspace.create).toHaveBeenCalledTimes(1);
      const ws = txMock.workspace.create.mock.calls[0][0] as {
        data: { ownerId: string; status: string; slug: string; name: string };
      };
      expect(ws.data.ownerId).toBe("mgr_1");
      expect(ws.data.status).toBe("READY");
      expect(ws.data.slug).toMatch(/^e2e-\d+-[0-9a-f]{8}$/);
      expect(typeof ws.data.name).toBe("string");

      expect(txMock.featureEntitlement.create).toHaveBeenCalledTimes(1);
      expect(txMock.featureEntitlement.create.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          data: {
            workspaceId: "ws_1",
            sku: "TECHNICIAN_SEATS",
            active: true,
            seats: 1,
          },
        }),
      );
      expect(txMock.userInvite.create).toHaveBeenCalledTimes(1);
    });

    it("A1z technicianSeats=0 → READY Workspace with an entitlement of seats 0", async () => {
      unblocked();
      const res = await POST(makeReq({ technicianSeats: 0 }));
      expect(res.status).toBe(200);
      expectBaseWritesOnTx();
      expect(txMock.workspace.create).toHaveBeenCalledTimes(1);
      expect(txMock.featureEntitlement.create).toHaveBeenCalledTimes(1);
      const fe = txMock.featureEntitlement.create.mock.calls[0][0] as {
        data: { seats: number; active: boolean };
      };
      expect(fe.data.seats).toBe(0);
      expect(fe.data.active).toBe(true);
    });

    it("A2 technicianSeats absent → neither Workspace nor entitlement", async () => {
      unblocked();
      const res = await POST(makeReq({ managerEmail: "mgr-a2@test.com" }));
      expect(res.status).toBe(200);
      expectBaseWritesOnTx();
      expect(txMock.workspace.create).not.toHaveBeenCalled();
      expect(txMock.featureEntitlement.create).not.toHaveBeenCalled();
    });

    it.each([[0], [50]])(
      "A3b technicianSeats=%s is accepted",
      async (seats) => {
        unblocked();
        const res = await POST(makeReq({ technicianSeats: seats }));
        expect(res.status).toBe(200);
        const fe = txMock.featureEntitlement.create.mock.calls[0][0] as {
          data: { seats: number };
        };
        expect(fe.data.seats).toBe(seats);
      },
    );
  });

  describe("A5: createInvite:false", () => {
    it("A5 skips the invite and returns token:null, inviteeEmail:null", async () => {
      unblocked();
      const res = await POST(
        makeReq({ technicianSeats: 2, createInvite: false }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        token: string | null;
        inviteeEmail: string | null;
      };
      expect(json.token).toBeNull();
      expect(json.inviteeEmail).toBeNull();
      expectBaseWritesOnTx();
      expect(txMock.userInvite.create).not.toHaveBeenCalled();
      expect(txMock.featureEntitlement.create).toHaveBeenCalledTimes(1);
    });

    it("A5 control: createInvite:true still writes the invite", async () => {
      unblocked();
      const res = await POST(makeReq({ createInvite: true }));
      expect(res.status).toBe(200);
      expect(txMock.userInvite.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("A3/A4: invalid input answers 400 before any Prisma call", () => {
    it.each([
      ["A3 technicianSeats -1", { technicianSeats: -1 }, "technicianSeats"],
      ['A3 technicianSeats "x"', { technicianSeats: "x" }, "technicianSeats"],
      ["A3 technicianSeats 51", { technicianSeats: 51 }, "technicianSeats"],
      ["A3 technicianSeats 1.5", { technicianSeats: 1.5 }, "technicianSeats"],
      ["A3 technicianSeats null", { technicianSeats: null }, "technicianSeats"],
      ["A4c unknown key", { technicianSeat: 1 }, "technicianSeat"],
      ["wrong type managerEmail number", { managerEmail: 5 }, "managerEmail"],
      ["wrong type managerEmail empty", { managerEmail: "" }, "managerEmail"],
      [
        "wrong type expiresInDays string",
        { expiresInDays: "7" },
        "expiresInDays",
      ],
      ["wrong type markUsed string", { markUsed: "true" }, "markUsed"],
      [
        "wrong type createInvite string",
        { createInvite: "no" },
        "createInvite",
      ],
    ])("%s → 400 {error, field}", async (_l, body, field) => {
      unblocked();
      const res = await POST(makeReq(body));
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string; field: string };
      expect(typeof json.error).toBe("string");
      expect(json.field).toBe(field);
      expectZeroWrites();
    });

    it.each([
      ["A4 malformed JSON", "{not json"],
      ["A4 empty body", ""],
      ["A4a null", "null"],
      ["A4a array", "[]"],
      ["A4a number", "5"],
      ["A4a string", '"seed"'],
      ["non-finite expiresInDays", '{"expiresInDays":1e999}'],
      ["A4c inherited key toString", '{"toString":1}'],
      ["A4c inherited key constructor", '{"constructor":{}}'],
      ["A4c own __proto__ key", '{"__proto__":{"technicianSeats":1}}'],
    ])("%s → 400", async (_l, raw) => {
      unblocked();
      const res = await POST(rawReq(raw));
      expect(res.status).toBe(400);
      expectZeroWrites();
    });

    it("A3/A4 control: a valid raw body in the same environment writes", async () => {
      unblocked();
      const res = await POST(rawReq('{"technicianSeats":1}'));
      expect(res.status).toBe(200);
      expectBaseWritesOnTx();
      expect(txMock.featureEntitlement.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("A6o/A6t/A6u/A8: transaction shape and failure", () => {
    it("A6o $transaction gets maxWait ≥ 20_000 and timeout 30_000", async () => {
      unblocked();
      await POST(makeReq({}));
      expect(transaction).toHaveBeenCalledTimes(1);
      const opts = (transaction.mock.calls[0][1] ?? {}) as {
        maxWait: number;
        timeout: number;
      };
      expect(opts.maxWait).toBeGreaterThanOrEqual(20_000);
      expect(opts.timeout).toBe(30_000);
    });

    it("A6t the last tx write (invite create) throws → 500 {error, code}, nothing outside tx", async () => {
      unblocked();
      const err = spyOnConsoleError();
      txMock.userInvite.create.mockRejectedValue(
        Object.assign(new Error("boom"), { code: "P2003" }),
      );
      const res = await POST(makeReq({ technicianSeats: 1 }));
      expectNothingOnPrisma();
      expect(res.status).toBe(500);
      const json = (await res.json()) as { error: string; code: unknown };
      expect(typeof json.error).toBe("string");
      expect(typeof json.code).toBe("string");
      expect(json.code).toBe("P2003");
      expect(txMock.userInvite.create).toHaveBeenCalledTimes(1);
      expectNothingOnPrisma();
      expect(err).toHaveBeenCalledTimes(1);
      expect(err.mock.calls[0][0]).toBe(
        "[test-helper] seed-org transaction failed",
      );
      expect(err.mock.calls[0][1]).toBe("P2003");
    });

    it("A6t with createInvite:false the entitlement create is last and throws → 500", async () => {
      unblocked();
      spyOnConsoleError();
      txMock.featureEntitlement.create.mockRejectedValue(
        Object.assign(new Error("boom"), { code: "P2002" }),
      );
      const res = await POST(
        makeReq({ technicianSeats: 1, createInvite: false }),
      );
      expect(res.status).toBe(500);
      expect(((await res.json()) as { code: string }).code).toBe("P2002");
      expect(txMock.userInvite.create).not.toHaveBeenCalled();
      expectNothingOnPrisma();
    });

    it("A6u a plain Error (no code) → 500 with code UNKNOWN", async () => {
      unblocked();
      const err = spyOnConsoleError();
      txMock.organization.create.mockRejectedValue(new Error("plain"));
      const res = await POST(makeReq({}));
      expect(res.status).toBe(500);
      expect(((await res.json()) as { code: string }).code).toBe("UNKNOWN");
      expect(err).toHaveBeenCalledTimes(1);
      expect(err.mock.calls[0][1]).toBe("UNKNOWN");
    });

    it("A8 reused managerEmail → tx user.create P2002 → 500, no entitlement, never upsert", async () => {
      unblocked();
      spyOnConsoleError();
      txMock.user.create.mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), {
          code: "P2002",
          meta: { target: ["email"] },
        }),
      );
      const res = await POST(
        makeReq({ managerEmail: "owner@test.com", technicianSeats: 2 }),
      );
      expect(res.status).toBe(500);
      expect(((await res.json()) as { code: string }).code).toBe("P2002");
      expect(txMock.user.create).toHaveBeenCalledTimes(1);
      expect(txMock.user.upsert).not.toHaveBeenCalled();
      expect(txMock.workspace.create).not.toHaveBeenCalled();
      expect(txMock.featureEntitlement.create).not.toHaveBeenCalled();
      expectNothingOnPrisma();
    });
  });
});

function spyOnConsoleError() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}
