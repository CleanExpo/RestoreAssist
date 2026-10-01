import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Exercise the actual routes, base guard, add-on guard and workspace resolver.
// Only persistence, authentication and provider operations use synthetic doubles.
const h = vi.hoisted(() => ({
  session: vi.fn(), user: vi.fn(), workspace: vi.fn(), membership: vi.fn(),
  entitlement: vi.fn(), integration: vi.fn(), create: vi.fn(), update: vi.fn(),
  state: vi.fn(), authorise: vi.fn(), clients: vi.fn(), jobs: vi.fn(),
  disconnect: vi.fn(), deleteClients: vi.fn(), deleteJobs: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: h.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: h.user }, workspace: { findFirst: h.workspace },
  workspaceMember: { findFirst: h.membership },
  featureEntitlement: { findUnique: h.entitlement },
  integration: { findFirst: h.integration, create: h.create, update: h.update },
  externalClient: { deleteMany: h.deleteClients }, externalJob: { deleteMany: h.deleteJobs },
} }));
vi.mock("@/lib/integrations/dev-mode", () => ({ isIntegrationDevMode: () => false }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (_request: unknown, _userId: string, work: () => unknown) => work(),
}));
vi.mock("@/lib/integrations/oauth-handler", () => ({
  PROVIDER_CONFIG: { XERO: { name: "Xero", usePKCE: true } },
  generatePKCE: () => ({ codeVerifier: "synthetic-verifier", codeChallenge: "synthetic-challenge" }),
  generateOAuthState: h.state, disconnectIntegration: h.disconnect,
}));
vi.mock("@/lib/integrations", () => ({
  getProviderAuthUrl: h.authorise,
  createClientForIntegration: async () => ({ syncClients: h.clients, syncJobs: h.jobs }),
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_request: unknown, detail: { status: number; message: string }) =>
    NextResponse.json({ error: detail.message }, { status: detail.status }),
  fromException: () => NextResponse.json({ error: "Internal server error" }, { status: 500 }),
}));

import { checkIntegrationAccess } from "../subscription-guard";
import { POST as connect } from "@/app/api/integrations/oauth/[provider]/connect/route";
import { POST as sync } from "@/app/api/integrations/oauth/[provider]/sync/route";
import { POST as disconnect } from "@/app/api/integrations/oauth/[provider]/disconnect/route";

const persistedUser = () => ({
  id: "synthetic-owner", subscriptionStatus: "ACTIVE", subscriptionPlan: "monthly",
  subscriptionEndsAt: null as Date | null, lifetimeAccess: false,
});
let user: ReturnType<typeof persistedUser> | null;
let addon: { id: string; active: boolean } | null;
const routes = [{ name: "connect", handle: connect }, { name: "sync", handle: sync }];
const request = () => new NextRequest("https://example.test/api/integrations/oauth/xero", {
  method: "POST", body: "{}",
});
const context = () => ({ params: Promise.resolve({ provider: "xero" }) });
const expectNoWork = () => {
  for (const spy of [h.integration, h.create, h.update, h.state, h.authorise, h.clients, h.jobs]) {
    expect(spy).not.toHaveBeenCalled();
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  user = persistedUser();
  addon = { id: "synthetic-addon", active: true };
  // Stale session hints must never grant base access after DB revocation.
  h.session.mockResolvedValue({ user: { id: "synthetic-owner", subscriptionStatus: "ACTIVE", lifetimeAccess: true } });
  h.user.mockImplementation(async ({ where, select }: { where: { id: string }; select: Record<string, boolean> }) => {
    if (!user || where.id !== user.id) return null;
    // Honour the real Prisma projection, so omitting lifetimeAccess is observable.
    return Object.fromEntries(Object.entries(user).filter(([field]) => select[field]));
  });
  h.workspace.mockImplementation(async ({ where }: { where: { ownerId: string } }) =>
    where.ownerId === "synthetic-owner" ? { id: "synthetic-workspace", name: "Synthetic" } : null);
  h.membership.mockResolvedValue(null);
  h.entitlement.mockImplementation(async ({ where }: { where: { workspaceId_sku: { workspaceId: string; sku: string } } }) =>
    where.workspaceId_sku.workspaceId === "synthetic-workspace" && where.workspaceId_sku.sku === "BOOKKEEPING" ? addon : null);
  h.integration.mockImplementation(async ({ where }: { where: { userId?: string; provider: string } }) =>
    (where.userId === undefined || where.userId === "synthetic-owner") && where.provider === "XERO"
      ? { id: "synthetic-xero", userId: "synthetic-owner", provider: "XERO", status: "CONNECTED" } : null);
  h.state.mockResolvedValue("synthetic-state");
  h.authorise.mockReturnValue("https://synthetic.invalid/authorise");
  h.clients.mockResolvedValue(1); h.jobs.mockResolvedValue(1);
  h.disconnect.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", () => { throw new Error("External network forbidden in this fixture"); });
});
afterEach(() => vi.unstubAllGlobals());

describe.each(routes)("Xero $name base entitlement", ({ handle, name }) => {
  it("accepts persisted lifetime access despite an old expired paid subscription", async () => {
    user = { ...persistedUser(), subscriptionStatus: "CANCELED", subscriptionEndsAt: new Date("2000-01-01"), lifetimeAccess: true };
    expect((await handle(request(), context())).status).toBe(200);
    expect(h.user).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "synthetic-owner" } }));
    expect(h.entitlement).toHaveBeenCalledOnce();
    expect(name === "connect" ? h.authorise : h.clients).toHaveBeenCalledOnce();
  });

  it.each(["TRIAL", "CANCELED", "PAST_DUE", "EXPIRED", "LIFETIME"])("denies ordinary %s status without a persisted lifetime flag", async status => {
    user!.subscriptionStatus = status;
    expect((await handle(request(), context())).status).toBe(403);
    expect(h.entitlement).not.toHaveBeenCalled(); expectNoWork();
  });

  it("rejects an expired ordinary ACTIVE subscription", async () => {
    user!.subscriptionEndsAt = new Date("2000-01-01");
    expect((await handle(request(), context())).status).toBe(403); expectNoWork();
  });

  it("rechecks removal of lifetime access on the next attempt", async () => {
    user = { ...persistedUser(), subscriptionStatus: "CANCELED", lifetimeAccess: true };
    expect((await handle(request(), context())).status).toBe(200);
    user.lifetimeAccess = false; vi.clearAllMocks();
    expect((await handle(request(), context())).status).toBe(403);
    expect(h.user).toHaveBeenCalledOnce(); expectNoWork();
  });

  it("rechecks revocation of ordinary paid access on the next attempt", async () => {
    expect((await handle(request(), context())).status).toBe(200);
    user!.subscriptionStatus = "CANCELED"; vi.clearAllMocks();
    expect((await handle(request(), context())).status).toBe(403); expectNoWork();
  });

  it.each(["inactive", "missing"])("denies %s Bookkeeping even while lifetime access remains", async condition => {
    user = { ...persistedUser(), subscriptionStatus: "CANCELED", lifetimeAccess: true };
    expect((await handle(request(), context())).status).toBe(200);
    addon = condition === "inactive" ? { id: "synthetic-addon", active: false } : null;
    vi.clearAllMocks();
    const response = await handle(request(), context());
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "ADDON_REQUIRED", sku: "BOOKKEEPING" });
    expect(h.entitlement).toHaveBeenCalledOnce(); expectNoWork();
  });

  it("fails closed when the persisted user is missing", async () => {
    user = null;
    expect((await handle(request(), context())).status).toBe(403); expectNoWork();
  });

  it("fails closed when the persisted user cannot be read", async () => {
    h.user.mockRejectedValueOnce(new Error("Synthetic DB unavailable"));
    expect((await handle(request(), context())).status).toBe(500);
    expect(h.entitlement).not.toHaveBeenCalled(); expectNoWork();
  });

  it("requires an authenticated caller before reading grants", async () => {
    h.session.mockResolvedValue(null);
    expect((await handle(request(), context())).status).toBe(401);
    expect(h.user).not.toHaveBeenCalled(); expectNoWork();
  });
});

it("does not mistake a lifetime plan label for a persisted lifetime grant", async () => {
  user = { ...persistedUser(), subscriptionStatus: "CANCELED", subscriptionPlan: "lifetime" };
  expect((await checkIntegrationAccess("synthetic-owner")).isAllowed).toBe(false);
});

it("allows a lapsed owner to disconnect without a base or Bookkeeping grant", async () => {
  user = { ...persistedUser(), subscriptionStatus: "CANCELED", lifetimeAccess: false };
  addon = null;
  expect((await disconnect(request(), context())).status).toBe(200);
  expect(h.disconnect).toHaveBeenCalledExactlyOnceWith("synthetic-xero");
  expect(h.user).not.toHaveBeenCalled(); expect(h.entitlement).not.toHaveBeenCalled();
});

it("cannot disconnect or delete another user's Xero connection", async () => {
  h.session.mockResolvedValue({ user: { id: "synthetic-other" } });
  const req = new NextRequest("https://example.test/api/integrations/oauth/xero/disconnect", {
    method: "POST", body: JSON.stringify({ deleteData: true, integrationId: "synthetic-xero", userId: "synthetic-owner" }),
  });
  expect((await disconnect(req, context())).status).toBe(404);
  expect(h.disconnect).not.toHaveBeenCalled();
  expect(h.deleteClients).not.toHaveBeenCalled(); expect(h.deleteJobs).not.toHaveBeenCalled();
});
