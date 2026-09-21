/**
 * RA-7595 — GET /api/admin/stripe-diagnostics is RestoreAssist's own
 * Stripe pipe, not a tenant's. `verifyAdminFromDb` only re-checks
 * `role: "ADMIN"`, and registration makes every business owner ADMIN of
 * their own firm. Tenant ADMIN is not sufficient.
 *
 * The gate is `isPlatformSupportOperator` (`PLATFORM_SUPPORT_USER_IDS`),
 * the same fail-closed allowlist as RA-7566 / RA-7592. Empty or unset
 * configuration refuses everyone.
 *
 * CLEAR bar: a tenant ADMIN must never receive platform Stripe event
 * payloads or secret-shape flags. The only allowed answers are 403 or
 * 404 — never a 200 that contains them. Watch this suite fail on the
 * unfixed route before the gate lands.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const stripeFindMany = vi.fn();
const stripeGroupBy = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    stripeWebhookEvent: {
      findMany: (...args: unknown[]) => stripeFindMany(...args),
      groupBy: (...args: unknown[]) => stripeGroupBy(...args),
    },
  },
}));

import { GET } from "../route";

const TENANT_ADMIN = "admin-tenant-ra7595";
const OPERATOR = "operator-ra7595";

const PLANTED_EVENT_ID = "evt_ra7595_planted";
const PLANTED_ERROR = "Invalid signature planted-ra7595";
const PLANTED_SECRET = "sk_live_ra7595_planted";
const PLANTED_WEBHOOK = "whsec_ra7595_planted";
const PLANTED_NEXTAUTH = "https://planted-ra7595.example.com";

const LEAK_MARKERS = [
  PLANTED_EVENT_ID,
  PLANTED_ERROR,
  PLANTED_SECRET,
  PLANTED_WEBHOOK,
  PLANTED_NEXTAUTH,
  "hasStripeSecretKey",
  "hasStripeWebhookSecret",
  "recentEvents",
  "STRIPE_WEBHOOK_SECRET",
];

const plantedEvent = {
  id: "swh_ra7595",
  stripeEventId: PLANTED_EVENT_ID,
  eventType: "invoice.payment_failed",
  status: "FAILED",
  processedAt: null,
  errorMessage: PLANTED_ERROR,
  retryCount: 2,
  createdAt: new Date("2026-09-21T00:00:00Z"),
};

function makeRequest() {
  return new NextRequest("http://localhost/api/admin/stripe-diagnostics");
}

function signIn(userId: string) {
  getServerSession.mockResolvedValue({
    user: { id: userId, role: "ADMIN" },
  });
  userFindUnique.mockResolvedValue({
    id: userId,
    role: "ADMIN",
    organizationId: "org-tenant-ra7595",
  });
}

function mockStripeQueries() {
  stripeFindMany.mockResolvedValue([plantedEvent]);
  stripeGroupBy.mockResolvedValue([{ status: "FAILED", _count: { id: 1 } }]);
}

async function assertNoPlatformStripeLeak(res: Response, body: unknown) {
  const serialized = JSON.stringify(body);
  const headerBlob = [...res.headers.entries()].flat().join("\n");
  for (const marker of LEAK_MARKERS) {
    expect(serialized, `body leaked ${marker}`).not.toContain(marker);
    expect(headerBlob, `header leaked ${marker}`).not.toContain(marker);
  }
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  stripeFindMany.mockReset();
  stripeGroupBy.mockReset();
  vi.unstubAllEnvs();
  vi.stubEnv("STRIPE_SECRET_KEY", PLANTED_SECRET);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", PLANTED_WEBHOOK);
  vi.stubEnv("NEXTAUTH_URL", PLANTED_NEXTAUTH);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/admin/stripe-diagnostics (RA-7595)", () => {
  it("rejects stale ADMIN JWTs when the database role has been demoted", async () => {
    getServerSession.mockResolvedValue({
      user: { id: TENANT_ADMIN, role: "ADMIN" },
    });
    userFindUnique.mockResolvedValue({
      id: TENANT_ADMIN,
      role: "USER",
      organizationId: "org-tenant-ra7595",
    });
    mockStripeQueries();

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(stripeFindMany).not.toHaveBeenCalled();
    expect(stripeGroupBy).not.toHaveBeenCalled();
    await assertNoPlatformStripeLeak(res, body);
  });

  it("refuses a tenant ADMIN — platform Stripe events are not a tenant privilege", async () => {
    signIn(TENANT_ADMIN);
    mockStripeQueries();
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");

    const res = await GET(makeRequest());
    const body = await res.json();

    expect([403, 404]).toContain(res.status);
    expect(body).toEqual({ error: "Forbidden" });
    expect(stripeFindMany).not.toHaveBeenCalled();
    expect(stripeGroupBy).not.toHaveBeenCalled();
    await assertNoPlatformStripeLeak(res, body);
  });

  it("fails closed when the operator allowlist names someone else", async () => {
    signIn(TENANT_ADMIN);
    mockStripeQueries();
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "different_user");

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(stripeFindMany).not.toHaveBeenCalled();
    await assertNoPlatformStripeLeak(res, body);
  });

  it("returns diagnostics only for an allowlisted platform-support operator", async () => {
    signIn(OPERATOR);
    mockStripeQueries();
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", " other_user, operator-ra7595 ");

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.env.hasStripeSecretKey).toBe(true);
    expect(body.env.hasStripeWebhookSecret).toBe(true);
    expect(body.env.nextAuthUrl).toBe(PLANTED_NEXTAUTH);
    expect(body.recentEvents[0].stripeEventId).toBe(PLANTED_EVENT_ID);
    expect(body.counts.failed).toBe(1);
    expect(stripeFindMany).toHaveBeenCalled();
  });
});
