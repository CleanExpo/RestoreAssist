/**
 * RA-8457 — no code could move a contractor certification out of PENDING.
 *
 * The decision route is the writer. These tests run it against an in-memory
 * certification store, so the handler's own compare-and-set `where` decides
 * what moves. On main before this change the route module does not exist and
 * the import fails.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();

type Cert = {
  id: string;
  profileId: string;
  verificationStatus: string;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  verificationNotes: string | null;
  expiryDate: Date | null;
};
type Profile = { id: string; isVerified: boolean; verifiedAt: Date | null };

const store = {
  users: new Map<string, { id: string; role: string; organizationId: null }>(),
  certs: new Map<string, Cert>(),
  profiles: new Map<string, Profile>(),
};

function matchesStatus(c: Cert, where: Record<string, unknown>) {
  if (where.id !== undefined && c.id !== where.id) return false;
  if (where.profileId !== undefined && c.profileId !== where.profileId)
    return false;
  if (
    where.verificationStatus !== undefined &&
    c.verificationStatus !== where.verificationStatus
  )
    return false;
  if (Array.isArray(where.OR)) {
    const now = (where.OR[1] as { expiryDate: { gt: Date } }).expiryDate.gt;
    if (!(c.expiryDate === null || c.expiryDate > now)) return false;
  }
  return true;
}

const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      store.users.get(where.id) ?? null,
  },
  contractorCertification: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      store.certs.get(where.id) ?? null,
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Partial<Cert>;
    }) => {
      let count = 0;
      for (const c of store.certs.values()) {
        if (matchesStatus(c, where)) {
          Object.assign(c, data);
          count++;
        }
      }
      return { count };
    },
    count: async ({ where }: { where: Record<string, unknown> }) =>
      [...store.certs.values()].filter((c) => matchesStatus(c, where)).length,
  },
  contractorProfile: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      store.profiles.get(where.id) ?? null,
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Profile>;
    }) => Object.assign(store.profiles.get(where.id)!, data),
  },
  $transaction: async (fn: (tx: unknown) => unknown) => fn(fakePrisma),
};

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return fakePrisma;
  },
}));

import { POST } from "../route";

const OPERATOR = "operator-ra8457";
const FIRM_OWNER = "firm-owner-ra8457";

function seed(status = "PENDING") {
  store.users.clear();
  store.certs.clear();
  store.profiles.clear();
  store.users.set(OPERATOR, {
    id: OPERATOR,
    role: "ADMIN",
    organizationId: null,
  });
  store.users.set(FIRM_OWNER, {
    id: FIRM_OWNER,
    role: "ADMIN",
    organizationId: null,
  });
  store.profiles.set("profile-1", {
    id: "profile-1",
    isVerified: false,
    verifiedAt: null,
  });
  store.certs.set("cert-1", {
    id: "cert-1",
    profileId: "profile-1",
    verificationStatus: status,
    verifiedAt: null,
    verifiedBy: null,
    verificationNotes: null,
    expiryDate: null,
  });
}

function signIn(id: string | null) {
  getServerSession.mockResolvedValue(
    id ? { user: { id, role: store.users.get(id)?.role } } : null,
  );
}

function call(body: unknown, id = "cert-1") {
  const request = new NextRequest(
    `http://localhost/api/admin/contractor-certifications/${id}/decision`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return POST(request, { params: Promise.resolve({ id }) });
}

describe("POST /api/admin/contractor-certifications/[id]/decision (RA-8457)", () => {
  beforeEach(() => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", OPERATOR);
    getServerSession.mockReset();
    seed();
  });

  it("refuses a signed-out caller with 401", async () => {
    signIn(null);
    const res = await call({ decision: "VERIFIED" });
    expect(res.status).toBe(401);
    expect(store.certs.get("cert-1")!.verificationStatus).toBe("PENDING");
  });

  it("refuses a business-owner ADMIN who is not a platform operator with 403", async () => {
    signIn(FIRM_OWNER);
    const res = await call({ decision: "VERIFIED" });
    expect(res.status).toBe(403);
    expect(store.certs.get("cert-1")!.verificationStatus).toBe("PENDING");
    expect(store.profiles.get("profile-1")!.isVerified).toBe(false);
  });

  it("lets a platform operator move PENDING to VERIFIED and marks the profile verified", async () => {
    signIn(OPERATOR);
    const res = await call({ decision: "VERIFIED" });
    expect(res.status).toBe(200);
    const cert = store.certs.get("cert-1")!;
    expect(cert.verificationStatus).toBe("VERIFIED");
    expect(cert.verifiedAt).toBeInstanceOf(Date);
    expect(cert.verifiedBy).toBe(OPERATOR);
    expect(store.profiles.get("profile-1")!.isVerified).toBe(true);
    const json = await res.json();
    expect(json.profileVerified).toBe(true);
  });

  it("rejects with the operator's note and leaves the profile unverified", async () => {
    signIn(OPERATOR);
    const res = await call({
      decision: "REJECTED",
      notes: "  Certificate number does not match the IICRC register  ",
    });
    expect(res.status).toBe(200);
    const cert = store.certs.get("cert-1")!;
    expect(cert.verificationStatus).toBe("REJECTED");
    expect(cert.verificationNotes).toBe(
      "Certificate number does not match the IICRC register",
    );
    expect(store.profiles.get("profile-1")!.isVerified).toBe(false);
  });

  it("requires a note on rejection", async () => {
    signIn(OPERATOR);
    const res = await call({ decision: "REJECTED", notes: "   " });
    expect(res.status).toBe(400);
    expect(store.certs.get("cert-1")!.verificationStatus).toBe("PENDING");
  });

  it("refuses any decision value other than VERIFIED or REJECTED", async () => {
    signIn(OPERATOR);
    for (const decision of ["PENDING", "EXPIRED", "verified", 1, undefined]) {
      const res = await call({ decision });
      expect(res.status).toBe(400);
    }
    expect(store.certs.get("cert-1")!.verificationStatus).toBe("PENDING");
  });

  it("returns 409 and changes nothing when the certification is not PENDING", async () => {
    seed("REJECTED");
    signIn(OPERATOR);
    const res = await call({ decision: "VERIFIED" });
    expect(res.status).toBe(409);
    expect(store.certs.get("cert-1")!.verificationStatus).toBe("REJECTED");
    expect(store.profiles.get("profile-1")!.isVerified).toBe(false);
  });

  it("returns 404 for an unknown certification", async () => {
    signIn(OPERATOR);
    const res = await call({ decision: "VERIFIED" }, "missing");
    expect(res.status).toBe(404);
  });
});
