import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const fixture = vi.hoisted(() => ({ rows: [] as any[], owner: "owner" }));
const calls = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), findMany: vi.fn(), audit: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/organization-credits", () => ({ getOrganizationOwner: async () => fixture.owner }));
vi.mock("@/lib/audit-log", () => ({ recordMutationAudit: calls.audit }));
vi.mock("@/lib/services/integrations/ai-connections", () => ({ listConfiguredAiConnections: async () => ({ workspaceId: "workspace", connections: [{ id: "canonical", provider: "OPENAI", status: "ACTIVE" }] }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { integration: {
  findMany: calls.findMany, findFirst: vi.fn(async ({ where }) => where.accessToken ? (fixture.rows[0]?.accessToken ? fixture.rows[0] : null) : fixture.rows[0]), create: calls.create, update: calls.update,
} } }));
import { GET, POST } from "../route";
import { PUT } from "../[id]/route";
const row = { id: "legacy-ai", userId: "owner", workspaceId: null, provider: "XERO", name: "OpenAI GPT", icon: "[ra:ai]", status: "ERROR", tenantId: null, realmId: null, companyId: null, tokenExpiresAt: null, apiKey: "synthetic-private-key", accessToken: null, refreshToken: null, config: JSON.stringify({ apiKeyType: "openai", secret: "synthetic-config-secret" }) };
const request = (method = "GET", body?: object) => new NextRequest("http://localhost/api/integrations", { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
beforeEach(() => {
  vi.clearAllMocks(); fixture.rows = [row]; fixture.owner = "owner";
  calls.findMany.mockImplementation(async ({ select }) => Object.keys(select).length === 1 ? fixture.rows.map(r => ({ id: r.id })) : fixture.rows);
  calls.update.mockImplementation(async ({ data }) => ({ ...row, ...data, accessToken: "synthetic-cipher", refreshToken: "synthetic-refresh" }));
});
describe("public integration metadata and canonical-only writes", () => {
  it("types legacy AI correctly and never serialises credentials or raw config", async () => {
    const response = await GET(request()); const body = await response.json();
    expect(body.integrations[0]).toMatchObject({ kind: "AI", provider: "OPENAI", source: "legacy", hasOAuthCredentials: false });
    expect(body.aiConnections[0]).toMatchObject({ provider: "OPENAI", status: "ACTIVE" });
    expect(body.workspaceId).toBe("workspace"); expect(body.truncated).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/synthetic-private|synthetic-cipher|synthetic-refresh|synthetic-config-secret|apiKey|accessToken|refreshToken/);
  });
  it.each([{ name: "OpenAI GPT", apiKey: "synthetic-key" }, { name: "Anthropic Claude", provider: "XERO" }, { name: "Unknown" }])("rejects generic creation without any database write", async data => {
    expect((await POST(request("POST", data))).status).toBe(400); expect(calls.create).not.toHaveBeenCalled();
  });
  it("redacts a legacy disable response even if database adapter supplies full row", async () => {
    const response = await PUT(request("PUT", { status: "DISCONNECTED" }), { params: Promise.resolve({ id: row.id }) });
    expect(response.status).toBe(200); const body = await response.json();
    expect(body.status).toBe("DISCONNECTED");
    expect(JSON.stringify(body)).not.toMatch(/synthetic-private|synthetic-cipher|synthetic-refresh|synthetic-config-secret|apiKey|accessToken|refreshToken/);
    expect(calls.update.mock.calls[0][0].data).not.toHaveProperty("config");
  });
  it.each([{ name: "Xero", icon: "/integrations/xero.svg" }, { apiKey: "synthetic-new" }, { status: "CONNECTED" }])("refuses identity conversion and unauthorised connection-state writes", async data => {
    expect((await PUT(request("PUT", data), { params: Promise.resolve({ id: row.id }) })).status).toBe(400);
    expect(calls.update).not.toHaveBeenCalled();
  });
  it("shows owner AI metadata without sharing the owner's OAuth records", async () => {
    fixture.owner = "org-owner";
    fixture.rows = [{ ...row, userId: "org-owner" }, { ...row, id: "org-xero", userId: "org-owner", name: "Xero", icon: "/integrations/xero.svg", config: null, tenantId: "org" }];
    const body = await (await GET(request())).json();
    expect(body.integrations.map((r: { id: string }) => r.id)).toEqual(["legacy-ai"]);
  });
});
