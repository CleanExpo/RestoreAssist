/**
 * RA-7634 (RA-7616 A4) — revoking or rotating a client's portal link must also
 * kill the unsigned signing links that link disclosed.
 *
 * `GET /api/portal/[token]/authorities` hands every unsigned CLIENT /
 * PROPERTY_OWNER `signatureRequestToken` to whoever holds the portal link. If
 * revoke/rotate only touch the ClientPortalAccount row, a leaked portal link
 * keeps its signing power forever through those tokens.
 *
 * The store below is a small in-memory stand-in for the two tables involved.
 * It is shared by the admin routes AND the real public signing route, so
 * "the cleared token is refused" is proven by the consuming route itself, not
 * by a stubbed `findUnique -> null`. Writes made through the `$transaction`
 * client are labelled "tx", everything else "root", which is how "in the same
 * transaction" is asserted. Unknown `where` keys throw, so a query shape the
 * fake does not understand fails loudly instead of matching nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type SigRow = {
  id: string;
  instanceId: string;
  clientId: string;
  signatoryRole: string;
  signatoryName: string;
  signatoryEmail: string | null;
  signedAt: Date | null;
  signatureRequestToken: string | null;
  signatureData: string | null;
};
type AccountRow = {
  id: string;
  clientId: string;
  organizationId: string;
  token: string;
  revokedAt: Date | null;
  tokenRotatedAt: Date | null;
};
type Call = { via: "root" | "tx"; model: string; op: string; args: unknown };

const db = vi.hoisted(() => ({
  accounts: [] as AccountRow[],
  sigs: [] as SigRow[],
  calls: [] as Call[],
  transactions: 0,
  // Fires once, right after the signing route looks its token up — used to
  // model a revoke landing between the route's read and its write.
  afterTokenLookup: null as null | (() => void),
}));

function pick<T extends Record<string, unknown>>(
  row: T,
  select: Record<string, unknown> | undefined,
) {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) out[key] = row[key];
  return out;
}

function sigMatches(row: SigRow, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    switch (key) {
      case "id":
      case "instanceId":
        if (row[key] !== cond) return false;
        break;
      case "signedAt":
        if (cond !== null) throw new Error("fake: unsupported signedAt filter");
        if (row.signedAt !== null) return false;
        break;
      case "signatureRequestToken":
        if (cond !== null && typeof cond === "object") {
          if ((cond as { not?: unknown }).not !== null) {
            throw new Error("fake: unsupported signatureRequestToken filter");
          }
          if (row.signatureRequestToken === null) return false;
        } else if (row.signatureRequestToken !== cond) {
          return false;
        }
        break;
      case "signatoryRole": {
        const list = (cond as { in?: unknown }).in;
        if (!Array.isArray(list)) {
          throw new Error("fake: unsupported signatoryRole filter");
        }
        if (!list.includes(row.signatoryRole)) return false;
        break;
      }
      case "instance": {
        const clientId = (cond as { report?: { clientId?: unknown } }).report
          ?.clientId;
        if (typeof clientId !== "string") {
          throw new Error("fake: unsupported instance filter");
        }
        if (row.clientId !== clientId) return false;
        break;
      }
      default:
        throw new Error(`fake: unsupported where key "${key}"`);
    }
  }
  return true;
}

function accountFor(where: {
  id?: string;
  client?: { user?: { organizationId?: string } };
}) {
  return (
    db.accounts.find(
      (a) =>
        a.id === where.id &&
        a.organizationId === where.client?.user?.organizationId,
    ) ?? null
  );
}

function makeClient(via: "root" | "tx") {
  const log = (model: string, op: string, args: unknown) =>
    db.calls.push({ via, model, op, args });
  return {
    user: {
      findUnique: async () => ({
        id: "u_admin",
        role: "ADMIN",
        organizationId: "org_1",
      }),
    },
    clientPortalAccount: {
      findUnique: async (args: {
        where: Parameters<typeof accountFor>[0];
        select?: Record<string, unknown>;
      }) => {
        log("clientPortalAccount", "findUnique", args);
        const row = accountFor(args.where);
        return row ? pick(row, args.select) : null;
      },
      update: async (args: {
        where: Parameters<typeof accountFor>[0];
        data: Partial<AccountRow>;
        select?: Record<string, unknown>;
      }) => {
        log("clientPortalAccount", "update", args);
        const row = accountFor(args.where);
        if (!row) throw new Error("fake: record to update not found");
        Object.assign(row, args.data);
        return pick(row, args.select);
      },
    },
    authorityFormSignature: {
      updateMany: async (args: {
        where: Record<string, unknown>;
        data: Partial<SigRow>;
      }) => {
        log("authorityFormSignature", "updateMany", args);
        const hits = db.sigs.filter((s) => sigMatches(s, args.where));
        for (const s of hits) Object.assign(s, args.data);
        return { count: hits.length };
      },
      findUnique: async (args: {
        where: { signatureRequestToken?: string; id?: string };
        include?: unknown;
      }) => {
        log("authorityFormSignature", "findUnique", args);
        const { signatureRequestToken, id } = args.where;
        const row =
          signatureRequestToken !== undefined
            ? db.sigs.find(
                (s) =>
                  s.signatureRequestToken !== null &&
                  s.signatureRequestToken === signatureRequestToken,
              )
            : db.sigs.find((s) => s.id === id);
        if (signatureRequestToken !== undefined && db.afterTokenLookup) {
          const hook = db.afterTokenLookup;
          db.afterTokenLookup = null;
          hook();
        }
        if (!row) return null;
        if (!args.include) return { ...row };
        return {
          ...row,
          instance: {
            id: row.instanceId,
            template: { name: "Authority to Commence", code: "ATC" },
            companyName: "Acme Restoration",
            companyLogo: null,
            companyPhone: null,
            companyEmail: null,
            clientName: "Margaret",
            clientAddress: "12 Test St",
            incidentBrief: null,
            incidentDate: null,
            authorityDescription: "Authority to commence works",
            status: "PENDING_SIGNATURES",
            signatures: [],
          },
        };
      },
      count: async (args: { where: Record<string, unknown> }) =>
        db.sigs.filter((s) => sigMatches(s, args.where)).length,
    },
    authorityFormInstance: {
      update: async () => ({}),
      findUnique: async () => ({ status: "PENDING_SIGNATURES" }),
    },
    inspection: {
      findFirst: async () => ({ id: "ins_1" }),
    },
    auditLog: {
      create: async (args: unknown) => {
        log("auditLog", "create", args);
        return {};
      },
    },
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ...makeClient("root"),
    $transaction: async (fn: unknown) => {
      if (typeof fn !== "function") {
        throw new Error("fake: only interactive transactions are modelled");
      }
      db.transactions += 1;
      return fn(makeClient("tx"));
    },
  },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({
    user: { id: "u_admin", role: "ADMIN" },
  })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@/lib/auth/botid", () => ({
  verifyBotId: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/authority-forms/notify-signatory-copy", () => ({
  notifySignatoryOfSignedCopy: vi.fn(async () => undefined),
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import { POST as revokeRoute } from "../revoke/route";
import { POST as rotateRoute } from "../rotate/route";
import {
  GET as signGet,
  POST as signPost,
} from "@/app/api/authority-forms/sign/[token]/route";

// The public signing route only accepts UUID-shaped tokens.
const OWN_CLIENT_TOKEN = "11111111-1111-4111-8111-111111111111";
const OWN_OWNER_TOKEN = "22222222-2222-4222-8222-222222222222";
const SIGNED_TOKEN = "33333333-3333-4333-8333-333333333333";
const INSURER_TOKEN = "44444444-4444-4444-8444-444444444444";
const OTHER_CLIENT_TOKEN = "55555555-5555-4555-8555-555555555555";

function seed(accountRevokedAt: Date | null = null) {
  db.calls.length = 0;
  db.transactions = 0;
  db.afterTokenLookup = null;
  db.accounts = [
    {
      id: "cpa_1",
      clientId: "c_1",
      organizationId: "org_1",
      token: "portal-token-before-rotation",
      revokedAt: accountRevokedAt,
      tokenRotatedAt: null,
    },
  ];
  const base = {
    instanceId: "afi_1",
    clientId: "c_1",
    signatoryName: "Margaret",
    signatoryEmail: "margaret@example.com",
    signatureData: null,
  };
  db.sigs = [
    {
      ...base,
      id: "sig_client",
      signatoryRole: "CLIENT",
      signedAt: null,
      signatureRequestToken: OWN_CLIENT_TOKEN,
    },
    {
      ...base,
      id: "sig_owner",
      signatoryRole: "PROPERTY_OWNER",
      signedAt: null,
      signatureRequestToken: OWN_OWNER_TOKEN,
    },
    {
      ...base,
      id: "sig_signed",
      signatoryRole: "CLIENT",
      signedAt: new Date("2026-09-01T00:00:00Z"),
      signatureRequestToken: SIGNED_TOKEN,
      signatureData: "data:image/png;base64,AA",
    },
    {
      ...base,
      id: "sig_insurer",
      signatoryRole: "INSURER",
      signatoryName: "Insurer",
      signedAt: null,
      signatureRequestToken: INSURER_TOKEN,
    },
    {
      ...base,
      id: "sig_other_client",
      instanceId: "afi_2",
      clientId: "c_2",
      signatoryRole: "CLIENT",
      signatoryName: "Someone else",
      signedAt: null,
      signatureRequestToken: OTHER_CLIENT_TOKEN,
    },
  ];
}

const sig = (id: string) => db.sigs.find((s) => s.id === id)!;

const adminPost = (action: "revoke" | "rotate") =>
  (action === "revoke" ? revokeRoute : rotateRoute)(
    new NextRequest(
      `http://localhost/api/admin/portal-accounts/cpa_1/${action}`,
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: "cpa_1" }) },
  );

const openSigningLink = (token: string) =>
  signGet(new NextRequest(`http://localhost/api/authority-forms/sign/${token}`), {
    params: Promise.resolve({ token }),
  });

const submitSignature = (token: string) =>
  signPost(
    new NextRequest(`http://localhost/api/authority-forms/sign/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signatureData: "data:image/png;base64,AA" }),
    }),
    { params: Promise.resolve({ token }) },
  );

function signatureWritesVia(via: "root" | "tx") {
  return db.calls.filter(
    (c) =>
      c.via === via &&
      c.model === "authorityFormSignature" &&
      c.op === "updateMany",
  );
}

function expectOnlyThisClientsUnsignedTokensCleared() {
  expect(sig("sig_client").signatureRequestToken).toBeNull();
  expect(sig("sig_owner").signatureRequestToken).toBeNull();
  // Signed rows keep their token and their signature.
  expect(sig("sig_signed").signatureRequestToken).toBe(SIGNED_TOKEN);
  expect(sig("sig_signed").signedAt).toEqual(new Date("2026-09-01T00:00:00Z"));
  expect(sig("sig_signed").signatureData).toBe("data:image/png;base64,AA");
  // The portal never disclosed non-client signatories' links.
  expect(sig("sig_insurer").signatureRequestToken).toBe(INSURER_TOKEN);
  // Another client's links are not this revoke's business.
  expect(sig("sig_other_client").signatureRequestToken).toBe(
    OTHER_CLIENT_TOKEN,
  );
}

beforeEach(() => seed());

describe("revoking a client's portal account (RA-7634 A4)", () => {
  it("clears the client's unsigned signing tokens in the same transaction as the revoke; signed ones are untouched", async () => {
    const res = await adminPost("revoke");

    expect(res.status).toBe(200);
    expect(db.accounts[0].revokedAt).toBeInstanceOf(Date);
    expectOnlyThisClientsUnsignedTokensCleared();

    expect(db.transactions).toBe(1);
    expect(signatureWritesVia("tx")).toHaveLength(1);
    expect(signatureWritesVia("root")).toHaveLength(0);
    const accountWrite = db.calls.find(
      (c) => c.model === "clientPortalAccount" && c.op === "update",
    );
    expect(accountWrite?.via).toBe("tx");
  });

  it("the signing route refuses a token that revoke cleared (and still honours one it did not)", async () => {
    // Positive control: the same token opens the signing page before revoke,
    // so a 404 afterwards is caused by the revoke, not by the harness.
    expect((await openSigningLink(OWN_CLIENT_TOKEN)).status).toBe(200);

    await adminPost("revoke");

    expect((await openSigningLink(OWN_CLIENT_TOKEN)).status).toBe(404);
    expect((await submitSignature(OWN_CLIENT_TOKEN)).status).toBe(404);
    expect((await openSigningLink(OWN_OWNER_TOKEN)).status).toBe(404);
    expect(sig("sig_client").signedAt).toBeNull();

    expect((await openSigningLink(INSURER_TOKEN)).status).toBe(200);
  });

  it("contains an account that was revoked before this fix: re-revoking still clears its signing tokens", async () => {
    const revokedAt = new Date("2026-08-01T00:00:00Z");
    seed(revokedAt);

    const res = await adminPost("revoke");

    expect(res.status).toBe(200);
    expect((await res.json()).data.alreadyRevoked).toBe(true);
    expect(db.accounts[0].revokedAt).toEqual(revokedAt);
    expectOnlyThisClientsUnsignedTokensCleared();
    expect(signatureWritesVia("tx")).toHaveLength(1);
  });

  it("a revoke landing between the signing route's lookup and its write still stops the signature", async () => {
    db.afterTokenLookup = () => {
      sig("sig_client").signatureRequestToken = null;
    };

    const res = await submitSignature(OWN_CLIENT_TOKEN);

    expect(res.status).not.toBe(200);
    expect(sig("sig_client").signedAt).toBeNull();
    expect(sig("sig_client").signatureData).toBeNull();
  });
});

describe("rotating a client's portal token (RA-7634 A4)", () => {
  it("clears the client's unsigned signing tokens in the same transaction as the rotation; signed ones are untouched", async () => {
    const res = await adminPost("rotate");

    expect(res.status).toBe(200);
    expect(db.accounts[0].token).not.toBe("portal-token-before-rotation");
    expectOnlyThisClientsUnsignedTokensCleared();

    expect(db.transactions).toBe(1);
    expect(signatureWritesVia("tx")).toHaveLength(1);
    expect(signatureWritesVia("root")).toHaveLength(0);
    const accountWrite = db.calls.find(
      (c) => c.model === "clientPortalAccount" && c.op === "update",
    );
    expect(accountWrite?.via).toBe("tx");
  });

  it("the signing route refuses a token that rotation cleared", async () => {
    expect((await openSigningLink(OWN_CLIENT_TOKEN)).status).toBe(200);

    await adminPost("rotate");

    expect((await openSigningLink(OWN_CLIENT_TOKEN)).status).toBe(404);
    expect((await submitSignature(OWN_CLIENT_TOKEN)).status).toBe(404);
    expect(sig("sig_client").signedAt).toBeNull();
    expect((await openSigningLink(INSURER_TOKEN)).status).toBe(200);
  });
});
