import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const m = vi.hoisted(() => ({
  session: vi.fn(), owner: vi.fn(), provision: vi.fn(), gate: vi.fn(), permission: vi.fn(),
  list: vi.fn(), upsert: vi.fn(), disable: vi.fn(), validate: vi.fn(), metadata: vi.fn(), member: vi.fn(), owned: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/ai-provider", () => ({ getEffectiveUserIdForIntegrations: m.owner }));
vi.mock("@/lib/workspace/provision", () => ({ ensureWorkspaceForUser: m.provision }));
vi.mock("@/lib/workspace/payment-gate", () => ({ checkPaymentGate: m.gate }));
vi.mock("@/lib/workspace/permissions", () => ({ hasPermission: m.permission }));
vi.mock("@/lib/workspace/provider-connections", () => ({ listProviderConnections: m.list, upsertProviderConnection: m.upsert, disableProviderConnection: m.disable, validateProviderKey: m.validate }));
vi.mock("@/lib/services/integrations/ai-connections", () => ({ listConfiguredAiConnections: m.metadata }));
vi.mock("@/lib/prisma", () => ({ prisma: { workspace: { findFirst: m.owned }, workspaceMember: { findFirst: m.member } } }));
vi.mock("@/lib/idempotency", () => ({ withIdempotency: async (req: Request, _: string, run: (s: string) => Promise<Response>) => run(await req.text()) }));
import { GET, POST, DELETE } from "../route";
import { POST as VALIDATE } from "../validate/route";
function request(method: string, body?: unknown) { return new NextRequest("http://localhost/api/workspace/provider-connections", {method, ...(body ? {body: JSON.stringify(body)} : {})}); }
beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue({user: {id: "manager"}});
  m.owner.mockResolvedValue("org_owner");
  m.gate.mockResolvedValue({allowed: true, workspace: {id: "owner_workspace", ownerId: "org_owner", name: "Synthetic workspace"}});
  m.owned.mockResolvedValue({id: "owner_workspace"});
  m.permission.mockResolvedValue(true);
  m.member.mockResolvedValue({id: "manager_membership"});
  m.metadata.mockResolvedValue({workspaceId: "owner_workspace", connections: [{id: "canonical", provider: "ANTHROPIC", status: "ACTIVE", lastValidatedAt: null, createdAt: "2026-10-01", updatedAt: "2026-10-01"}]});
  m.upsert.mockResolvedValue({id: "canonical"});
  m.validate.mockResolvedValue({valid: true});
});
describe("canonical AI identity scope", () => {
  it("GET reads metadata in the effective workspace without provisioning or decrypting", async () => {
    const result = await GET(request("GET"));
    expect(result.status).toBe(200);
    expect(m.metadata).toHaveBeenCalledWith("org_owner");
    expect(m.provision).not.toHaveBeenCalled();
    expect(m.list).not.toHaveBeenCalled();
    expect(m.gate).not.toHaveBeenCalled();
    expect(await result.json()).toMatchObject({workspaceId: "owner_workspace", connections: [{id: "canonical", status: "ACTIVE"}]});
  });
  it.each(["POST", "DELETE", "VALIDATE"])("%s uses owner scope but requires permission from the actual actor", async method => {
    const req = request(method === "DELETE" ? "DELETE" : "POST", {provider: "ANTHROPIC", apiKey: "sk-ant-synthetic-fixture-key"});
    const result = await (method === "POST" ? POST(req) : method === "DELETE" ? DELETE(req) : VALIDATE(req));
    expect(result.status).toBe(200);
    expect(m.gate).toHaveBeenCalledWith("org_owner");
    expect(m.permission).toHaveBeenCalledWith("manager", "owner_workspace", "workspace.settings");
    if (method === "POST") expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({workspaceId: "owner_workspace", memberId: "manager_membership"}));
    if (method === "DELETE") expect(m.disable).toHaveBeenCalledWith("owner_workspace", "ANTHROPIC");
    if (method === "VALIDATE") expect(m.validate).toHaveBeenCalledWith("owner_workspace", "ANTHROPIC");
  });
  it.each(["POST", "DELETE", "VALIDATE"])("%s refuses an unauthorised actor before provider work", async method => {
    m.permission.mockResolvedValue(false);
    const req = request(method === "DELETE" ? "DELETE" : "POST", {provider: "ANTHROPIC", apiKey: "sk-ant-synthetic-fixture-key"});
    expect((await (method === "POST" ? POST(req) : method === "DELETE" ? DELETE(req) : VALIDATE(req))).status).toBe(403);
    expect(m.upsert).not.toHaveBeenCalled(); expect(m.disable).not.toHaveBeenCalled(); expect(m.validate).not.toHaveBeenCalled();
    expect(m.provision).not.toHaveBeenCalled(); expect(m.gate).not.toHaveBeenCalled();
  });
  it.each(["POST", "DELETE", "VALIDATE"])("%s refuses a member whose effective owner has no owned workspace", async method => {
    m.owned.mockResolvedValue(null);
    const req = request(method === "DELETE" ? "DELETE" : "POST", {provider: "ANTHROPIC", apiKey: "sk-ant-synthetic-fixture-key"});
    expect((await (method === "POST" ? POST(req) : method === "DELETE" ? DELETE(req) : VALIDATE(req))).status).toBe(403);
    expect(m.provision).not.toHaveBeenCalled(); expect(m.gate).not.toHaveBeenCalled();
  });
  it.each(["POST", "DELETE", "VALIDATE"])("%s rejects a payment-gate workspace outside the authorised owner", async method => {
    m.gate.mockResolvedValue({allowed: true, workspace: {id: "foreign_workspace", ownerId: "foreign_owner"}});
    const req = request(method === "DELETE" ? "DELETE" : "POST", {provider: "ANTHROPIC", apiKey: "sk-ant-synthetic-fixture-key"});
    expect((await (method === "POST" ? POST(req) : method === "DELETE" ? DELETE(req) : VALIDATE(req))).status).toBe(403);
    expect(m.upsert).not.toHaveBeenCalled(); expect(m.disable).not.toHaveBeenCalled(); expect(m.validate).not.toHaveBeenCalled();
  });
  it("lets an owner provision their own missing workspace before configuring a key", async () => {
    m.session.mockResolvedValue({user: {id: "org_owner"}});
    m.owned.mockResolvedValue(null);
    const result = await POST(request("POST", {provider: "ANTHROPIC", apiKey: "sk-ant-synthetic-fixture-key"}));
    expect(result.status).toBe(200);
    expect(m.provision).toHaveBeenCalledWith("org_owner");
    expect(m.owned).not.toHaveBeenCalled();
  });
  it("preserves the payment gate before writing", async () => {
    m.gate.mockResolvedValue({allowed: false, response: NextResponse.json({error: "Suspended"}, {status: 403})});
    expect((await POST(request("POST", {provider: "ANTHROPIC", apiKey: "sk-ant-synthetic-fixture-key"}))).status).toBe(403);
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("rejects anonymous metadata and writes", async () => {
    m.session.mockResolvedValue(null);
    for (const handler of [GET, POST, DELETE, VALIDATE]) expect((await handler(request("POST"))).status).toBe(401);
    expect(m.owner).not.toHaveBeenCalled(); expect(m.metadata).not.toHaveBeenCalled(); expect(m.upsert).not.toHaveBeenCalled();
  });
});
