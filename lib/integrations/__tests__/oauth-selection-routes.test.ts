import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const fixture = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
const calls = vi.hoisted(() => ({ update: vi.fn(), disconnect: vi.fn(), client: vi.fn(), state: vi.fn(), create: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => ({ user: { id: "owner" } })) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/integrations/subscription-guard", () => ({ checkIntegrationAccess: vi.fn(async () => ({ isAllowed: true })), createSubscriptionRequiredResponse: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ requireAddon: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/idempotency", () => ({ withIdempotency: (_req: unknown, _id: unknown, fn: () => unknown) => fn() }));
vi.mock("@/lib/integrations/dev-mode", () => ({ isIntegrationDevMode: () => false }));
vi.mock("@/lib/integrations/oauth-handler", () => ({ PROVIDER_CONFIG: { XERO: { name: "Xero", icon: "/integrations/xero.svg" } }, disconnectIntegration: calls.disconnect, generateOAuthState: calls.state, generatePKCE: vi.fn() }));
vi.mock("@/lib/integrations", () => ({ createClientForIntegration: calls.client, getProviderAuthUrl: () => "https://example.test/oauth" }));
vi.mock("@/lib/prisma", () => ({ prisma: { integration: {
  findMany: vi.fn(async ({ where }) => fixture.rows.filter(r => r.userId === where.userId && r.provider === where.provider && (!where.id || r.id === where.id))),
  findFirst: vi.fn(async ({ where }) => fixture.rows.find(r => r.userId === where.userId && r.provider === where.provider && (!where.id || r.id === where.id) && (!where.accessToken || r.accessToken))),
  update: calls.update, create: calls.create,
}, externalClient: { deleteMany: vi.fn() }, externalJob: { deleteMany: vi.fn() } } }));
vi.mock("@/lib/integrations/xero/client", () => ({ createXeroClient: calls.client }));
import { POST as sync } from "@/app/api/integrations/oauth/[provider]/sync/route";
import { POST as disconnect } from "@/app/api/integrations/oauth/[provider]/disconnect/route";
import { POST as connect } from "@/app/api/integrations/oauth/[provider]/connect/route";
const ai = { id: "ai", userId: "owner", provider: "XERO", name: "OpenAI GPT", icon: "[ra:ai]", status: "CONNECTED", tenantId: null };
const genuine = { id: "xero", userId: "owner", provider: "XERO", name: "Xero", icon: null, status: "CONNECTED", tenantId: "org", accessToken: "synthetic" };
const request = (action: string) => new NextRequest(`http://localhost/api/integrations/oauth/xero/${action}`, { method: "POST", body: "{}" });
const ctx = () => ({ params: Promise.resolve({ provider: "xero" }) });
beforeEach(() => {
  vi.clearAllMocks(); fixture.rows = [];
  calls.create.mockResolvedValue(genuine); calls.state.mockResolvedValue("state");
  calls.client.mockResolvedValue({ syncClients: async () => 0, syncJobs: async () => 0, syncWithLifecycle: async () => ({ clientsCount: 0, jobsCount: 0 }) });
});
describe("real route provider selection with synthetic records", () => {
  it.each([sync, disconnect])("refuses AI-only XERO rows before mutations/provider calls", async route => {
    fixture.rows = [ai, { ...ai, id: "claude", name: "Anthropic Claude" }];
    expect((await route(request("action"), ctx())).status).toBe(404);
    expect(calls.update).not.toHaveBeenCalled(); expect(calls.disconnect).not.toHaveBeenCalled(); expect(calls.client).not.toHaveBeenCalled();
  });
  it("connect creates a genuine OAuth record instead of binding state to AI", async () => {
    fixture.rows = [ai];
    expect((await connect(request("connect"), ctx())).status).toBe(200);
    expect(calls.create).toHaveBeenCalledOnce();
    expect(calls.state).toHaveBeenCalledWith("owner", "XERO", expect.objectContaining({ integrationId: "xero" }));
  });
  it("selects genuine Xero in a mixed set and refuses missing organisation", async () => {
    fixture.rows = [ai, genuine];
    expect((await sync(request("sync"), ctx())).status).toBe(200);
    expect(calls.client).toHaveBeenCalledWith("xero");
    expect(calls.update.mock.calls.every(([arg]) => arg.where.id === "xero")).toBe(true);
    vi.clearAllMocks(); fixture.rows = [{ ...genuine, tenantId: null }];
    expect((await sync(request("sync"), ctx())).status).toBe(409);
    expect(calls.update).not.toHaveBeenCalled(); expect(calls.client).not.toHaveBeenCalled();
  });
  it.each([sync, disconnect, connect])("refuses ambiguous workspace records", async route => {
    fixture.rows = [genuine, { ...genuine, id: "other", workspaceId: "other" }];
    expect((await route(request("action"), ctx())).status).toBe(409);
    expect(calls.update).not.toHaveBeenCalled(); expect(calls.disconnect).not.toHaveBeenCalled(); expect(calls.state).not.toHaveBeenCalled();
  });
});
