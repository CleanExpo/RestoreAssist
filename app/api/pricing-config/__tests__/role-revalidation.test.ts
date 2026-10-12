/**
 * RA-paid-client tranche 1 — pricing configuration role revalidation.
 *
 * Every read/write route that changes or reveals protected pricing
 * configuration MUST revalidate the caller's role from the database on
 * every request. The JWT `session.user.role` claim can be stale for up to
 * 90 days after a demotion, and a demoted technician must not continue
 * to read or write admin-only rates.
 *
 * The canonical helper is `verifyAdminFromDb` (lib/admin-auth.ts). This
 * suite pins the four required scenarios:
 *
 *   1. Stale elevated JWT with a downgraded database user
 *   2. Unauthenticated access
 *   3. Unauthorized non-admin access
 *   4. Authorized admin behavior (the happy path keeps working)
 *
 * Tenant isolation (the route still scopes reads/writes to its own
 * userId) and the existing subscription controls (free plans stay
 * locked) are exercised in the per-route test files and are not
 * duplicated here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  users: {} as Record<string, Record<string, unknown>>,
}));
const session = vi.hoisted(() => vi.fn());
// Hoisted mock references so the tests can both observe calls and
// control return values for the happy path (organization scoping).
const orgFindFirst = vi.hoisted(() => vi.fn());
const orgPricingUpsert = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/services/integrations/ai-readiness", () => ({
  hasConfiguredAi: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        db.users[where.id] ?? null,
    },
    organizationPricingConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: orgPricingUpsert,
    },
    companyPricingConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(null),
    },
    organization: { findFirst: orgFindFirst },
    integration: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

import { GET, PUT } from "../route";
import { PATCH as setupPatch } from "../../setup/pricing/route";

function seedUser(
  id: string,
  dbRole: string | null,
  opts: { organizationId?: string | null } = {},
) {
  const base = {
    id,
    role: dbRole,
    organizationId: opts.organizationId ?? null,
    subscriptionStatus: "ACTIVE",
    creditsRemaining: null,
    subscriptionPlan: null,
    monthlyReportsUsed: 0,
    monthlyResetDate: null,
    trialEndsAt: null,
    addonReports: 0,
    lifetimeAccess: false,
  };
  db.users[id] = base;
}

const getReq = () =>
  new NextRequest("http://localhost/api/pricing-config", { method: "GET" });

const putReq = (body: unknown) =>
  new NextRequest("http://localhost/api/pricing-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const setupReq = (body: unknown) =>
  new Request("http://localhost/api/setup/pricing", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  db.users = {};
  session.mockReset();
  // Default to "no org found" so the existing role-failure and
  // unauth cases do not accidentally let a setup PATCH reach the
  // organization-scoping path. The new admin-happy-path test
  // overrides these per-test.
  orgFindFirst.mockReset();
  orgFindFirst.mockResolvedValue(null);
  orgPricingUpsert.mockReset();
  orgPricingUpsert.mockResolvedValue(null);
});

describe("pricing config role revalidation (RA-paid-client tranche 1)", () => {
  describe("stale elevated JWT with a downgraded database user", () => {
    it("GET refuses when the JWT says ADMIN but the DB says USER", async () => {
      seedUser("alice", "USER");
      // The JWT was minted when Alice was ADMIN; the helper must NOT
      // trust that claim and must re-query the DB.
      session.mockResolvedValue({ user: { id: "alice", role: "ADMIN" } });
      const res = await GET(getReq());
      expect(res.status).toBe(403);
    });

    it("PUT refuses when the JWT says ADMIN but the DB says USER", async () => {
      seedUser("alice", "USER");
      session.mockResolvedValue({ user: { id: "alice", role: "ADMIN" } });
      const res = await PUT(putReq({}));
      expect(res.status).toBe(403);
    });

    it("setup PATCH refuses when the JWT says ADMIN but the DB says USER", async () => {
      seedUser("alice", "USER");
      session.mockResolvedValue({ user: { id: "alice", role: "ADMIN" } });
      const res = await setupPatch(setupReq({ administrationFee: 200 }));
      expect(res.status).toBe(403);
    });

    it("GET refuses when the JWT says ADMIN but the user no longer exists", async () => {
      // DB lookup returns null — the helper must not silently let an
      // orphan JWT through. `verifyAdminFromDb` returns 403 in that case
      // (matches its other "JWT says ADMIN, DB disagrees" branch).
      session.mockResolvedValue({ user: { id: "ghost", role: "ADMIN" } });
      const res = await GET(getReq());
      expect(res.status).toBe(403);
    });
  });

  describe("unauthenticated access", () => {
    it("GET returns 401 with no session", async () => {
      session.mockResolvedValue(null);
      const res = await GET(getReq());
      expect(res.status).toBe(401);
    });

    it("PUT returns 401 with no session", async () => {
      session.mockResolvedValue(null);
      const res = await PUT(putReq({}));
      expect(res.status).toBe(401);
    });

    it("setup PATCH returns 401 with no session", async () => {
      session.mockResolvedValue(null);
      const res = await setupPatch(setupReq({ administrationFee: 200 }));
      expect(res.status).toBe(401);
    });
  });

  describe("unauthorized non-admin access", () => {
    it("GET returns 403 for a USER role", async () => {
      seedUser("bob", "USER");
      session.mockResolvedValue({ user: { id: "bob", role: "USER" } });
      const res = await GET(getReq());
      expect(res.status).toBe(403);
    });

    it("PUT returns 403 for a USER role", async () => {
      seedUser("bob", "USER");
      session.mockResolvedValue({ user: { id: "bob", role: "USER" } });
      const res = await PUT(putReq({}));
      expect(res.status).toBe(403);
    });

    it("setup PATCH returns 403 for a USER role", async () => {
      seedUser("bob", "USER");
      session.mockResolvedValue({ user: { id: "bob", role: "USER" } });
      const res = await setupPatch(setupReq({ administrationFee: 200 }));
      expect(res.status).toBe(403);
    });

    it("GET returns 403 when the session carries no role claim", async () => {
      // Defends the JWT-shape contract: a session that doesn't even
      // claim a role must not slip through the role pre-check.
      seedUser("carol", "ADMIN");
      session.mockResolvedValue({ user: { id: "carol" } });
      const res = await GET(getReq());
      expect(res.status).toBe(403);
    });
  });

  describe("authorized admin behavior", () => {
    it("GET reaches the route's data layer for an admin", async () => {
      seedUser("dave", "ADMIN");
      session.mockResolvedValue({ user: { id: "dave", role: "ADMIN" } });
      const res = await GET(getReq());
      // 200 is the success path: the role check passed and the route
      // returned the (empty) pricing config payload. The resolver
      // returned null in the mock, so the response is the defaults
      // shape — what we care about is that we got past the gate.
      expect(res.status).toBe(200);
    });

    it("PUT reaches the subscription lock for an admin (rejects on empty body)", async () => {
      // An empty body fails validation AFTER the role check AND the
      // subscription check both pass; status 400 is the expected signal
      // that the gate chain is intact and the handler ran end-to-end.
      seedUser("dave", "ADMIN");
      session.mockResolvedValue({ user: { id: "dave", role: "ADMIN" } });
      const res = await PUT(putReq({}));
      expect(res.status).toBe(400);
    });

    it("setup PATCH returns 200 for an admin and the upsert is scoped to the admin's organization", async () => {
      // The happy path: a fresh admin owns an organization whose
      // setup is not yet complete, the body contains a patchable
      // field, and the handler must (a) return 200 and (b) write to
      // organizationPricingConfig with the WHERE bound to the
      // authenticated admin's organization id — never to a value
      // taken from the request body.
      const ORG_ID = "org_admin_dave";
      seedUser("dave", "ADMIN");
      session.mockResolvedValue({ user: { id: "dave", role: "ADMIN" } });

      // The route queries organization by ownerId (the admin's user
      // id), not by any value in the request body. The org must not
      // be "setup complete", otherwise the handler returns 409 before
      // the upsert.
      orgFindFirst.mockResolvedValue({
        id: ORG_ID,
        setupCompletedAt: null,
      });

      const res = await setupPatch(
        setupReq({ administrationFee: 250 }),
      );

      expect(res.status).toBe(200);

      // Defence-in-depth: the role check ran (we got past 401/403),
      // the org lookup ran (we got past 404), the setup-completed
      // check passed (we got past 409), and the patch contained at
      // least one valid field (we got past 400). The 200 + the
      // upsert call below prove the gate chain is intact.
      expect(orgFindFirst).toHaveBeenCalledTimes(1);
      const findCall = orgFindFirst.mock.calls[0]?.[0] as
        | { where?: { ownerId?: string } }
        | undefined;
      expect(findCall?.where?.ownerId).toBe("dave");

      // The upsert MUST be scoped to the admin's organization id, not
      // to anything taken from the request body. This is the
      // organisation-pricing-tenant-isolation guard.
      expect(orgPricingUpsert).toHaveBeenCalledTimes(1);
      const upsertArgs = orgPricingUpsert.mock.calls[0]?.[0] as
        | { where?: { organizationId?: string }; create?: { organizationId?: string } }
        | undefined;
      expect(upsertArgs?.where?.organizationId).toBe(ORG_ID);
      expect(upsertArgs?.create?.organizationId).toBe(ORG_ID);

      // The response body lists the patched fields.
      const json = await res.json();
      expect(json?.data?.updated).toEqual(
        expect.arrayContaining(["administrationFee"]),
      );
    });
  });
});
