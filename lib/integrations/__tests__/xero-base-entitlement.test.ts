import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Exercise the actual routes, base guard, add-on guard and workspace resolver.
// Only persistence, authentication and provider operations use synthetic doubles.
const h = vi.hoisted(() => ({
  session: vi.fn(), user: vi.fn(), workspace: vi.fn(), membership: vi.fn(),
  entitlement: vi.fn(), integration: vi.fn(), create: vi.fn(), update: vi.fn(),
  state: vi.fn(), authorise: vi.fn(), clients: vi.fn(), jobs: vi.fn(),
  disconnect: vi.fn(), deleteClients: vi.fn(), deleteJobs: vi.fn(),
  xeroCreate: vi.fn(), xeroSync: vi.fn(),
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
vi.mock("@/lib/integrations/xero/client", () => ({ createXeroClient: h.xeroCreate }));
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
  subscriptionEndsAt: null as Date | null, trialEndsAt: null as Date | null,
  lifetimeAccess: false, role: "ADMIN", organization: null as { ownerId: string } | null,
});
let user: ReturnType<typeof persistedUser> | null;
let addon: { id: string; active: boolean; stripePriceId?: string | null; workspace?: { ownerId: string; status: string } } | null;
const routes = [{ name: "connect", handle: connect }, { name: "sync", handle: sync }];
const request = () => new NextRequest("https://example.test/api/integrations/oauth/xero", {
  method: "POST", body: "{}",
});
const context = () => ({ params: Promise.resolve({ provider: "xero" }) });
const expectNoWork = () => {
  for (const spy of [h.integration, h.create, h.update, h.state, h.authorise, h.clients, h.jobs, h.xeroCreate, h.xeroSync]) {
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
  h.integration.mockImplementation(async ({ where }: { where: { userId?: string; provider: string; workspaceId?: string } }) =>
    (where.userId === undefined || where.userId === "synthetic-owner") && where.provider === "XERO" &&
      (where.workspaceId === undefined || where.workspaceId === "synthetic-workspace")
      ? { id: "synthetic-xero", userId: "synthetic-owner", workspaceId: "synthetic-workspace",
          provider: "XERO", status: "CONNECTED" } : null);
  h.state.mockResolvedValue("synthetic-state");
  h.authorise.mockReturnValue("https://synthetic.invalid/authorise");
  h.clients.mockResolvedValue(1); h.jobs.mockResolvedValue(1);
  h.xeroCreate.mockResolvedValue({ syncWithLifecycle: h.xeroSync });
  h.xeroSync.mockImplementation(async (options: { syncClients: boolean; syncJobs: boolean }) => ({
    clientsCount: options.syncClients ? await h.clients() : 0,
    jobsCount: options.syncJobs ? await h.jobs() : 0,
  }));
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

  it("allows a current Founding Trial with its own complimentary Bookkeeping grant", async () => {
    user = { ...persistedUser(), subscriptionStatus: "TRIAL", trialEndsAt: new Date("2099-01-01") };
    addon = { id: "synthetic-founder-grant", active: true,
      stripePriceId: "complimentary:founding-trial", workspace: { ownerId: "synthetic-owner", status: "READY" } };
    expect((await handle(request(), context())).status).toBe(200);
    expect(name === "connect" ? h.authorise : h.clients).toHaveBeenCalledOnce();
  });

  it("rechecks a removed complimentary grant on the next attempt", async () => {
    user = { ...persistedUser(), subscriptionStatus: "TRIAL", trialEndsAt: new Date("2099-01-01") };
    addon = { id: "synthetic-founder-grant", active: true,
      stripePriceId: "complimentary:founding-trial", workspace: { ownerId: "synthetic-owner", status: "READY" } };
    expect((await handle(request(), context())).status).toBe(200);
    addon = null; vi.clearAllMocks();
    expect((await handle(request(), context())).status).toBe(403);
    expectNoWork();
  });

  if (name === "sync") {
    it("does not use workspace B's Xero connection with workspace A's founder grant", async () => {
      user = { ...persistedUser(), subscriptionStatus: "TRIAL", trialEndsAt: new Date("2099-01-01") };
      addon = { id: "synthetic-founder-grant", active: true,
        stripePriceId: "complimentary:founding-trial", workspace: { ownerId: "synthetic-owner", status: "READY" } };
      h.integration.mockImplementation(async ({ where }: { where: { workspaceId?: string } }) =>
        where.workspaceId === "synthetic-workspace" ? null :
          { id: "synthetic-foreign-workspace-xero", userId: "synthetic-owner", workspaceId: "synthetic-workspace-b",
            provider: "XERO", status: "CONNECTED" });
      expect((await handle(request(), context())).status).toBe(409);
      expect(h.integration).toHaveBeenCalledWith(expect.objectContaining({ where:
        expect.objectContaining({ workspaceId: "synthetic-workspace" }) }));
      for (const spy of [h.create, h.update, h.state, h.authorise, h.clients, h.jobs, h.xeroCreate, h.xeroSync]) {
        expect(spy).not.toHaveBeenCalled();
      }
    });
  } else {
    it("does not create a duplicate beside a genuine legacy null-workspace Xero connection", async () => {
      user = { ...persistedUser(), subscriptionStatus: "TRIAL", trialEndsAt: new Date("2099-01-01") };
      addon = { id: "synthetic-founder-grant", active: true,
        stripePriceId: "complimentary:founding-trial", workspace: { ownerId: "synthetic-owner", status: "READY" } };
      h.integration.mockImplementation(async ({ where }: { where: { workspaceId?: string } }) =>
        where.workspaceId === "synthetic-workspace" ? null :
          { id: "synthetic-legacy-xero", userId: "synthetic-owner", workspaceId: null,
            provider: "XERO", name: "Xero", status: "CONNECTED" });
      expect((await handle(request(), context())).status).toBe(409);
      expect(h.create).not.toHaveBeenCalled();
      expect(h.state).not.toHaveBeenCalled();
      expect(h.authorise).not.toHaveBeenCalled();
    });

    it("creates a first-time Xero connection inside the granted workspace", async () => {
      user = { ...persistedUser(), subscriptionStatus: "TRIAL", trialEndsAt: new Date("2099-01-01") };
      addon = { id: "synthetic-founder-grant", active: true,
        stripePriceId: "complimentary:founding-trial", workspace: { ownerId: "synthetic-owner", status: "READY" } };
      h.integration.mockResolvedValue(null);
      h.create.mockResolvedValue({ id: "synthetic-new-xero", userId: "synthetic-owner",
        workspaceId: "synthetic-workspace", provider: "XERO", status: "DISCONNECTED" });
      expect((await handle(request(), context())).status).toBe(200);
      expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ data:
        expect.objectContaining({ userId: "synthetic-owner", workspaceId: "synthetic-workspace", provider: "XERO" }) }));
    });
  }

  it("uses the persisted organisation owner's grant for an active member", async () => {
    user = { ...persistedUser(), subscriptionStatus: "TRIAL", trialEndsAt: new Date("2099-01-01") };
    addon = { id: "synthetic-founder-grant", active: true,
      stripePriceId: "complimentary:founding-trial", workspace: { ownerId: "synthetic-owner", status: "READY" } };
    h.session.mockResolvedValue({ user: { id: "synthetic-member", subscriptionStatus: "ACTIVE", lifetimeAccess: true } });
    h.user.mockImplementation(async ({ where, select }: { where: { id: string }; select: Record<string, boolean> }) => {
      const row = where.id === "synthetic-member"
        ? { ...persistedUser(), id: "synthetic-member", role: "TECHNICIAN", organization: { ownerId: "synthetic-owner" },
            subscriptionStatus: "CANCELED", trialEndsAt: null, lifetimeAccess: false }
        : user;
      if (!row || (where.id !== "synthetic-member" && where.id !== "synthetic-owner")) return null;
      return Object.fromEntries(Object.entries(row).filter(([field]) => select[field]));
    });
    h.membership.mockResolvedValue({ workspace: { id: "synthetic-workspace", name: "Synthetic", status: "READY" } });
    h.integration.mockResolvedValue({ id: "synthetic-member-xero", userId: "synthetic-member", provider: "XERO",
      workspaceId: "synthetic-workspace", status: "CONNECTED" });
    expect((await handle(request(), context())).status).toBe(200);
    expect(h.user).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "synthetic-owner" } }));
    expect(name === "connect" ? h.authorise : h.clients).toHaveBeenCalledOnce();

    h.membership.mockResolvedValue(null); vi.clearAllMocks();
    expect((await handle(request(), context())).status).toBe(403);
    expectNoWork();
  });

  it.each([
    ["expired trial", new Date("2000-01-01"), true, "complimentary:founding-trial", "synthetic-owner"],
    ["ordinary paid add-on", new Date("2099-01-01"), true, "price_synthetic", "synthetic-owner"],
    ["revoked grant", new Date("2099-01-01"), false, "complimentary:founding-trial", "synthetic-owner"],
    ["foreign workspace grant", new Date("2099-01-01"), true, "complimentary:founding-trial", "synthetic-other"],
  ] as const)("denies a %s without calling the provider", async (_case, trialEndsAt, active, stripePriceId, ownerId) => {
    user = { ...persistedUser(), subscriptionStatus: "TRIAL", trialEndsAt };
    addon = { id: "synthetic-grant", active, stripePriceId, workspace: { ownerId, status: "READY" } };
    expect((await handle(request(), context())).status).toBe(403);
    expectNoWork();
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

it.each(["XERO", "QUICKBOOKS", "MYOB"])("uses the same current founder grant for %s bookkeeping access", async provider => {
  user = { ...persistedUser(), subscriptionStatus: "TRIAL", trialEndsAt: new Date("2099-01-01") };
  addon = { id: "synthetic-founder-grant", active: true,
    stripePriceId: "complimentary:founding-trial", workspace: { ownerId: "synthetic-owner", status: "READY" } };
  expect(await checkIntegrationAccess("synthetic-owner", provider)).toMatchObject({
    isAllowed: true, foundingTrialWorkspaceId: "synthetic-workspace",
  });
});

it.each([undefined, "ASCORA", "SERVICEM8", "UNKNOWN"])("does not use a Bookkeeping grant for %s", async provider => {
  user = { ...persistedUser(), subscriptionStatus: "TRIAL", trialEndsAt: new Date("2099-01-01") };
  addon = { id: "synthetic-founder-grant", active: true,
    stripePriceId: "complimentary:founding-trial", workspace: { ownerId: "synthetic-owner", status: "READY" } };
  expect((await checkIntegrationAccess("synthetic-owner", provider)).isAllowed).toBe(false);
  expect(h.entitlement).not.toHaveBeenCalled();
});

it("allows a lapsed owner to disconnect without a base or Bookkeeping grant", async () => {
  user = { ...persistedUser(), subscriptionStatus: "CANCELED", lifetimeAccess: false };
  addon = null;
  expect((await disconnect(request(), context())).status).toBe(200);
  expect(h.disconnect).toHaveBeenCalledExactlyOnceWith("synthetic-xero", "XERO");
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

// These tests cover route policy/import behaviour; provider identity has dedicated real-service regressions.
vi.mock("@/lib/services/integrations/select-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/integrations/select-oauth")>();
  return { ...actual, selectOAuthIntegration: vi.fn(async (input: { prisma: any; userId: string; provider: string; workspaceId?: string; requireReady?: boolean }) => {
    const row = await input.prisma.integration.findFirst({ where: { userId: input.userId, provider: input.provider,
      ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
      ...(input.requireReady ? { status: { in: ["CONNECTED", "ERROR", "SYNCING"] } } : {}) } });
    return row ? { ok: true, data: row } : { ok: false, reason: "NOT_FOUND" };
  }) };
});
