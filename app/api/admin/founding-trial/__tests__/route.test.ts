/**
 * RA-7721 — POST /api/admin/founding-trial: the operator grant.
 *
 * `role: "ADMIN"` is every self-registered firm owner, so ADMIN alone must
 * never reach the grant. The user double answers by id with a real ADMIN row
 * for BOTH the tenant admin and the operator, so a refusal can only come from
 * the PLATFORM_SUPPORT_USER_IDS allowlist, never from a lookup that returned
 * nothing. The positive control (same double, allowlisted id) proves the
 * route is reachable at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const orgFindUnique = vi.fn();
const runFoundingTrialGrant = vi.fn();

const OPERATOR = "operator_ra7721";
const TENANT_ADMIN = "tenant_admin_ra7721";
const ADMIN_ROWS: Record<string, { id: string; role: string; organizationId: string }> = {
  [OPERATOR]: { id: OPERATOR, role: "ADMIN", organizationId: "org_platform" },
  [TENANT_ADMIN]: { id: TENANT_ADMIN, role: "ADMIN", organizationId: "org_tenant" },
};

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/stripe", () => ({ stripe: { marker: "stripe" } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string } }) =>
        where.id ? (ADMIN_ROWS[where.id] ?? null) : null,
      ),
    },
    organization: {
      findUnique: (...args: unknown[]) => orgFindUnique(...args),
    },
  },
}));
vi.mock("@/lib/billing/founding-trial-grant", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/founding-trial-grant")>()),
  runFoundingTrialGrant: (...args: unknown[]) => runFoundingTrialGrant(...args),
}));

import { POST } from "../route";

function signIn(id: string) {
  getServerSession.mockResolvedValue({ user: { id, role: "ADMIN" } });
}

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/admin/founding-trial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  getServerSession.mockReset();
  orgFindUnique.mockReset();
  runFoundingTrialGrant.mockReset();
  orgFindUnique.mockImplementation(async ({ where }: { where: { id?: string; abn?: string } }) =>
    where.abn === "51824753556" || where.id === "org_firm" ? { id: "org_firm" } : null,
  );
  runFoundingTrialGrant.mockResolvedValue({
    status: "dry_run",
    entity: { abn: "51824753556", legalName: "WATERLINE RESTORATIONS PTY LTD", tradingNames: [] },
    result: { workspaceId: "ws_1", granted: [], skippedPaid: [], prior: {}, applied: false },
    basePlan: { outcome: "extended", applied: false, trialEndsAt: new Date("2026-11-27T00:00:00Z") },
  });
  vi.unstubAllEnvs();
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/admin/founding-trial — who may grant", () => {
  it("refuses a tenant ADMIN (every self-signup is an ADMIN) with 403, and grants nothing", async () => {
    signIn(TENANT_ADMIN);
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", OPERATOR);
    const res = await post({ abn: "51824753556", apply: true });
    expect(res.status).toBe(403);
    expect(runFoundingTrialGrant).not.toHaveBeenCalled();
    expect(orgFindUnique).not.toHaveBeenCalled();
  });

  it("fails closed when the operator allowlist is unset — even for the operator", async () => {
    signIn(OPERATOR);
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");
    const res = await post({ abn: "51824753556", apply: true });
    expect(res.status).toBe(403);
    expect(runFoundingTrialGrant).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller", async () => {
    getServerSession.mockResolvedValue(null);
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", OPERATOR);
    const res = await post({ abn: "51824753556" });
    expect(res.status).toBe(401);
    expect(runFoundingTrialGrant).not.toHaveBeenCalled();
  });

  it("positive control: an allowlisted operator reaches the grant, dry run by default", async () => {
    signIn(OPERATOR);
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", `someone_else, ${OPERATOR}`);
    const res = await post({ abn: "518 247 535 56" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(runFoundingTrialGrant).toHaveBeenCalledTimes(1);
    const args = runFoundingTrialGrant.mock.calls[0][0];
    expect(args).toMatchObject({ organizationId: "org_firm", apply: false });
    expect(args.settleMs).toBeLessThanOrEqual(30_000);
    expect(body.outcome.entity.legalName).toBe("WATERLINE RESTORATIONS PTY LTD");
  });
});

describe("POST /api/admin/founding-trial — what it grants", () => {
  beforeEach(() => {
    signIn(OPERATOR);
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", OPERATOR);
  });

  const CONFIRMED = {
    organizationId: "org_firm",
    abn: "51824753556",
    legalName: "WATERLINE RESTORATIONS PTY LTD",
  };

  it("applies only on an explicit apply: true", async () => {
    await post({ organizationId: "org_firm", apply: "true" });
    expect(runFoundingTrialGrant.mock.calls[0][0].apply).toBe(false);
    await post({ organizationId: "org_firm", apply: true, confirmed: CONFIRMED });
    expect(runFoundingTrialGrant.mock.calls[1][0].apply).toBe(true);
  });

  it("the dry run tells the page which organisation it previewed", async () => {
    const body = await (await post({ abn: "51824753556" })).json();
    expect(body.organizationId).toBe("org_firm");
  });

  it("Apply without the previewed identity is refused before any grant", async () => {
    const res = await post({ organizationId: "org_firm", apply: true });
    expect(res.status).toBe(400);
    const partial = await post({ organizationId: "org_firm", apply: true, confirmed: { abn: "51824753556" } });
    expect(partial.status).toBe(400);
    expect(runFoundingTrialGrant).not.toHaveBeenCalled();
  });

  it("Apply carries the previewed organisation, ABN and ABR name into the grant", async () => {
    await post({ organizationId: "org_firm", apply: true, confirmed: CONFIRMED });
    expect(runFoundingTrialGrant.mock.calls[0][0].confirmed).toEqual(CONFIRMED);
  });

  it("identity changed since Preview is a 409", async () => {
    runFoundingTrialGrant.mockResolvedValue({
      status: "identity_changed",
      organizationId: "org_firm",
      reason: "Preview again",
    });
    const res = await post({ organizationId: "org_firm", apply: true, confirmed: CONFIRMED });
    expect(res.status).toBe(409);
    expect((await res.json()).outcome.status).toBe("identity_changed");
  });

  it("an ABN no business holds is a 404, not a guess", async () => {
    const res = await post({ abn: "33102417032", apply: true, confirmed: CONFIRMED });
    expect(res.status).toBe(404);
    expect(runFoundingTrialGrant).not.toHaveBeenCalled();
  });

  it("needs exactly one of abn or organizationId", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ abn: "51824753556", organizationId: "org_firm" })).status).toBe(400);
    expect((await post({ abn: "not-an-abn" })).status).toBe(400);
    expect(runFoundingTrialGrant).not.toHaveBeenCalled();
  });

  it("a business without an ABR-verified ABN is refused with 422", async () => {
    runFoundingTrialGrant.mockResolvedValue({
      status: "unverified_abn",
      organizationId: "org_firm",
      reason: "ABR has not confirmed this business's ABN",
    });
    const res = await post({ organizationId: "org_firm", apply: true, confirmed: CONFIRMED });
    expect(res.status).toBe(422);
    expect((await res.json()).outcome.status).toBe("unverified_abn");
  });

  it("a Stripe billing clash is a 409", async () => {
    runFoundingTrialGrant.mockResolvedValue({ status: "refused", workspaceId: "ws_1", conflicts: [] });
    const res = await post({ organizationId: "org_firm", apply: true, confirmed: CONFIRMED });
    expect(res.status).toBe(409);
  });
});
